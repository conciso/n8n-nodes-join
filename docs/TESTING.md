## Coverage Reports & Test Results

This repository automatically generates test coverage reports and uploads them as GitHub artifacts for each CI run.

### Coverage Reports

**Available Reports:**
- **HTML Coverage Report**: Detailed interactive coverage report
- **LCOV Coverage**: Machine-readable coverage data
- **JSON Coverage**: Coverage data in JSON format
- **JUnit XML**: Test results for CI integration

### Accessing Reports

1. **GitHub Artifacts**: Download coverage reports from the "Artifacts" section of each workflow run
2. **Codecov** (if configured): View coverage trends and compare PRs at codecov.io
3. **Local Development**: Run `npm run test:coverage` to generate reports in `/coverage` folder

### Coverage Thresholds

Current coverage targets:
- **Statements**: > 95%
- **Branches**: > 80%
- **Functions**: 100%
- **Lines**: > 95%

### Report Retention

- **Development/PR**: 7 days
- **Main Branch**: 30 days  
- **Production Release**: 90 days
