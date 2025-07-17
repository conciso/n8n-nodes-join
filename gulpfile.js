const { src, dest, series, parallel } = require('gulp');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const os = require('os');
require('dotenv').config();

// Clean dist folder
function clean(done) {
    if (fs.existsSync('dist')) {
        fs.rmSync('dist', { recursive: true, force: true });
    }
    done();
}

// Clean node_modules and package-lock
function cleanAll(done) {
    if (fs.existsSync('dist')) {
        fs.rmSync('dist', { recursive: true, force: true });
    }
    if (fs.existsSync('node_modules')) {
        fs.rmSync('node_modules', { recursive: true, force: true });
    }
    if (fs.existsSync('package-lock.json')) {
        fs.unlinkSync('package-lock.json');
    }
    done();
}

// npm install
function install(done) {
    const npm = spawn('npm', ['install'], { stdio: 'inherit' });
    npm.on('close', (code) => {
        done(code === 0 ? null : new Error(`npm install failed`));
    });
}

// TypeScript compilation
function typescript(done) {
    const tsc = spawn('npx', ['tsc', '--excludeDirectories', 'dist'], { stdio: 'inherit' });
    tsc.on('close', (code) => {
        done(code === 0 ? null : new Error(`TypeScript compilation failed`));
    });
}

// Copy assets
function copyAssets() {
    return src(['nodes/**/*.json', 'nodes/**/*.svg'])
        .pipe(dest('dist/nodes'));
}

// ESLint
function lint(done) {
    const eslint = spawn('npx', ['eslint', '--fix', 'nodes/**/*.ts'], { stdio: 'inherit' });
    eslint.on('close', (code) => {
        if (code === 0) {
            console.log('✅ ESLint passed');
            done();
        } else {
            done(new Error('ESLint found errors - build failed'));
        }
    });
}

// Prettier
function format(done) {
    const prettier = spawn('npx', ['prettier', '--write', 'nodes/**/*.ts', 'dist/**/*.js'], { stdio: 'inherit' });
    prettier.on('close', (code) => {
        if (code !== 0) {
            console.log('⚠️  Prettier found issues, but continuing...');
        }
        done(); // Continue regardless of Prettier result
    });
}

// Stop n8n
function stopN8n(done) {
    exec('pkill -f "n8n start"', () => {
        setTimeout(done, 1000); // Wait 1 second
    });
}

// Start n8n
function startN8n(done) {
    console.log('🚀 Starting n8n with debug logging...');
    spawn('n8n', ['start'], { 
        stdio: 'inherit',
        detached: true,
        env: { 
            ...process.env, 
            N8N_LOG_LEVEL: 'debug',
            N8N_LOG_OUTPUT: 'console'
        }
    });
    setTimeout(done, 2000); // Wait 2 seconds
}

function createDeployTask(target) {
    return function deployTo(done) {
        const user = process.env[`${target.toUpperCase()}_DEPLOY_USER`];
        const host = process.env[`${target.toUpperCase()}_DEPLOY_HOST`];
        const remotePath = process.env[`${target.toUpperCase()}_DEPLOY_PATH`];
        const containerName = process.env[`${target.toUpperCase()}_DEPLOY_CONTAINER`] || 'n8n';

        if (!user || !host || !remotePath) {
            done(new Error(`Missing ${target} deployment configuration. Check .env file.`));
            return;
        }

        console.log(`🚀 Deploying to ${target}: ${user}@${host}:${remotePath}`);

        const rsync = spawn('rsync', [
            '-av',
            '--delete',
            '--relative',
            'package.json',
            'package-lock.json',
            'index.js',
            'node_modules/',
            'dist/',
            `${user}@${host}:${remotePath}/n8n-nodes-join/`
        ], { stdio: 'inherit' });

        rsync.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Deploy successful, restarting container...');
                createRestartTask(target)(done);
            } else {
                done(new Error('Rsync failed'));
            }
        });
    };
}

function createRestartTask(target) {
    return function restartContainer(done) {
        const user = process.env[`${target.toUpperCase()}_DEPLOY_USER`];
        const host = process.env[`${target.toUpperCase()}_DEPLOY_HOST`];
        const containerName = process.env[`${target.toUpperCase()}_DEPLOY_CONTAINER`] || 'n8n';

        console.log(`🔄 Restarting ${containerName} container on ${target}...`);
        const restart = spawn('ssh', [
            `${user}@${host}`,
            `docker restart ${containerName}`
        ], { stdio: 'inherit' });

        restart.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ Deployment to ${target} successful!`);
            } else {
                console.log(`⚠️  Container restart on ${target} failed`);
            }
            done();
        });
    };
}

function publishToNpm(done) {
    const npmToken = process.env.NPM_TOKEN;
    
    if (!npmToken) {
        done(new Error('Missing NPM_TOKEN'));
        return;
    }

    console.log('Publishing to NPM...');

    const npmrcPath = `${os.homedir()}/.npmrc`;
    const npmrcContent = `//registry.npmjs.org/:_authToken=${npmToken}\n`;
    
    // Backup existing .npmrc
    let existingNpmrc = '';
    if (fs.existsSync(npmrcPath)) {
        existingNpmrc = fs.readFileSync(npmrcPath, 'utf8');
    }
    
    // Write new .npmrc with token
    fs.writeFileSync(npmrcPath, npmrcContent);
    
    const npm = spawn('npm', ['publish'], { stdio: 'inherit' });
    
    npm.on('close', (code) => {
        // Restore original .npmrc
        if (existingNpmrc) {
            fs.writeFileSync(npmrcPath, existingNpmrc);
        } else if (fs.existsSync(npmrcPath)) {
            fs.unlinkSync(npmrcPath);
        }
        
        if (code === 0) {
            console.log('✅ Package published to NPM');
        }
        
        done(code === 0 ? null : new Error('NPM publish failed'));
    });
}

function release(type) {
    return function createRelease(done) {
        const { execSync } = require('child_process');
        const validTypes = ['patch', 'minor', 'major'];
        
        if (!validTypes.includes(type)) {
            done(new Error(`Invalid version type: ${type}. Use: ${validTypes.join(', ')}`));
            return;
        }
        
        try {
            // Branch-Check
            const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
            if (branch !== 'development') {
                done(new Error(`Wrong branch: ${branch}. Switch to development first.`));
                return;
            }
            
            console.log(`Creating ${type} release...`);
            
            // Version Bump
            const npm = spawn('npm', ['version', type], { stdio: 'inherit' });
            
            npm.on('close', (code) => {
                if (code === 0) {
                    console.log('Pushing release to GitHub...');
                    
                    // Push mit Tags
                    const git = spawn('git', ['push', 'origin', 'development', '--follow-tags'], { stdio: 'inherit' });
                    
                    git.on('close', (pushCode) => {
                        if (pushCode === 0) {
                            console.log('✅ Release created and pushed successfully');
                            console.log('Create GitHub Release to trigger production deployment');
                        }
                        done(pushCode === 0 ? null : new Error('Git push failed'));
                    });
                } else {
                    done(new Error('Version bump failed'));
                }
            });
            
        } catch (error) {
            done(error);
        }
    };
}

// Task definitions
const build = series(
    copyAssets,
    typescript,
    format 
);
const dev = series(build, stopN8n, startN8n);
const init = series(cleanAll, install);
const deployStaging = series(
    clean,
    build,
    createDeployTask('staging'),
    createRestartTask('staging')
);

const deployProduction = series(
    clean,
    build,
    publishToNpm
);

// Exports
exports.lint = lint;
exports.format = format;
exports.clean = clean;
exports.build = build;
exports.dev = dev;
exports.deployStaging = deployStaging;
exports.deployProduction = deployProduction;
exports.releasePatch = release('patch');
exports.releaseMinor = release('minor'); 
exports.releaseMajor = release('major');
exports.init = init;
exports.default = build;
