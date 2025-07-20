import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

// Global storage for collecting data across multiple executions
export const globalDataStore: { [storageKey: string]: any } = {};

// Memory management: Track storage usage and implement cleanup
interface StorageEntry {
	inputs: any[];
	startTime: number;
	expectedCount: number;
	lastAccessTime: number;
	metadata?: {
		workflowId: string;
		nodeId: string;
		executionId: string;
	};
}

// Cleanup configuration
const CLEANUP_CONFIG = {
	MAX_STORAGE_ENTRIES: 1000, // Maximum number of concurrent storage entries
	STALE_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes for stale entries
	CLEANUP_INTERVAL_MS: 60 * 1000, // Run cleanup every minute
	MEMORY_PRESSURE_THRESHOLD: 100, // Start aggressive cleanup after 100 entries
};

// Global cleanup interval
let cleanupInterval: NodeJS.Timeout | null = null;

// Initialize cleanup process
function initializeCleanup() {
	if (cleanupInterval) return; // Already initialized
	
	cleanupInterval = setInterval(() => {
		performCleanup();
	}, CLEANUP_CONFIG.CLEANUP_INTERVAL_MS);
	
	// Allow Node.js to exit even if this timer is still running (for tests)
	cleanupInterval.unref();
}

// Perform automatic cleanup of stale storage entries
function performCleanup(aggressive = false) {
	const now = Date.now();
	const keys = Object.keys(globalDataStore);
	let removedCount = 0;
	
	// Determine cleanup threshold based on memory pressure
	const threshold = aggressive || keys.length > CLEANUP_CONFIG.MEMORY_PRESSURE_THRESHOLD 
		? CLEANUP_CONFIG.STALE_TIMEOUT_MS / 2 // More aggressive cleanup
		: CLEANUP_CONFIG.STALE_TIMEOUT_MS;
	
	for (const key of keys) {
		const entry = globalDataStore[key] as StorageEntry;
		
		// Remove entries that are stale based on last access time
		if (entry && entry.lastAccessTime && (now - entry.lastAccessTime) > threshold) {
			delete globalDataStore[key];
			removedCount++;
		}
		// Also remove entries that have been waiting too long
		else if (entry && entry.startTime && (now - entry.startTime) > (threshold * 2)) {
			delete globalDataStore[key];
			removedCount++;
		}
	}
	
	// If we're still over threshold, remove oldest entries
	if (keys.length > CLEANUP_CONFIG.MAX_STORAGE_ENTRIES) {
		const sortedKeys = Object.keys(globalDataStore)
			.map(key => ({ key, lastAccess: (globalDataStore[key] as StorageEntry).lastAccessTime || 0 }))
			.sort((a, b) => a.lastAccess - b.lastAccess);
		
		const toRemove = sortedKeys.slice(0, keys.length - CLEANUP_CONFIG.MAX_STORAGE_ENTRIES);
		toRemove.forEach(({ key }) => {
			delete globalDataStore[key];
			removedCount++;
		});
	}
	
	if (removedCount > 0) {
		console.log(`Join Node: Cleaned up ${removedCount} stale storage entries`);
	}
}

// Helper to access storage with automatic cleanup tracking
function accessStorage(storageKey: string): StorageEntry | null {
	const entry = globalDataStore[storageKey] as StorageEntry;
	if (entry) {
		entry.lastAccessTime = Date.now();
		return entry;
	}
	return null;
}

// Enhanced source identifier determination with multiple fallback strategies
function determineSourceIdentifier(items: INodeExecutionData[], fallbackIndex: number): string {
	if (!items || items.length === 0) {
		return `source_${fallbackIndex}`;
	}

	const firstItem = items[0];
	
	// Strategy 1: Use pairedItem information
	try {
		if (firstItem.pairedItem) {
			if (Array.isArray(firstItem.pairedItem)) {
				// Array format: use first item
				const item = firstItem.pairedItem[0];
				return `source_${item.item || item}`;
			} else if (typeof firstItem.pairedItem === 'object' && 'item' in firstItem.pairedItem) {
				// Object format
				return `source_${firstItem.pairedItem.item}`;
			} else {
				// Primitive value
				return `source_${firstItem.pairedItem}`;
			}
		}
	} catch (error) {
		console.warn('Join Node: Error extracting pairedItem identifier:', error);
	}

	// Strategy 2: Use node metadata if available
	try {
		if (firstItem.json && typeof firstItem.json === 'object') {
			const json = firstItem.json as any;
			
			// Look for common identifier fields
			if (json.nodeId) return `source_node_${json.nodeId}`;
			if (json.sourceId) return `source_${json.sourceId}`;
			if (json.id) return `source_id_${json.id}`;
			if (json._id) return `source_id_${json._id}`;
		}
	} catch (error) {
		console.warn('Join Node: Error extracting metadata identifier:', error);
	}

	// Strategy 3: Generate hash-based identifier from data structure
	try {
		const dataStructure = JSON.stringify(Object.keys(firstItem.json || {}));
		const simpleHash = dataStructure.split('').reduce((hash, char) => {
			return ((hash << 5) - hash + char.charCodeAt(0)) & 0xffffffff;
		}, 0);
		return `source_hash_${Math.abs(simpleHash)}`;
	} catch (error) {
		console.warn('Join Node: Error generating hash identifier:', error);
	}

	// Strategy 4: Fallback to execution order
	return `source_exec_${fallbackIndex}`;
}

// Generate simple hash for deduplication
function generateDataHash(items: INodeExecutionData[]): string {
	try {
		const dataString = JSON.stringify(items.map(item => item.json));
		let hash = 0;
		for (let i = 0; i < dataString.length; i++) {
			const char = dataString.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash).toString(16);
	} catch (error) {
		console.warn('Join Node: Error generating data hash:', error);
		return `hash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}
}

export class Join implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Join',
		name: 'join',
		icon: 'file:join.svg',
		group: ['transform'],
		version: 1,
		subtitle: 'Join parallel workflow branches',
		description: 'Waits for all parallel inputs and combines them into a single JSON object',
		defaults: {
			name: 'Join',
		},
		inputs: ['main'] as any,
		outputs: ['main'] as any,
		properties: [
			{
				displayName: 'Expected Inputs',
				name: 'expectedInputs',
				type: 'number',
				default: 2,
				description: 'Number of parallel inputs to wait for (2-99)',
				typeOptions: {
					minValue: 2,
					maxValue: 99,
				},
			},
			{
				displayName: 'Timeout (Seconds)',
				name: 'timeout',
				type: 'number',
				default: 30,
				description: 'Maximum time to wait for all inputs',
			},
			{
				displayName: 'Include Metadata',
				name: 'includeMetadata',
				type: 'boolean',
				default: false,
				description: 'Whether to include execution metadata in the output',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const expectedInputs = this.getNodeParameter('expectedInputs', 0, 2) as number;
		const timeout = this.getNodeParameter('timeout', 0, 30) as number;
		const includeMetadata = this.getNodeParameter('includeMetadata', 0, false) as boolean;

		// Initialize cleanup system
		initializeCleanup();

		try {
			// Get current execution context
			const workflowId = this.getWorkflow().id || 'unknown';
			const nodeId = this.getNode().id;
			const executionId = this.getExecutionId();
			const storageKey = `${workflowId}_${nodeId}_${executionId}`;

			// Get input data for this execution
			const items = this.getInputData();

			if (!items || items.length === 0) {
				throw new NodeOperationError(this.getNode(), 'No input data received');
			}

			// Initialize storage with enhanced structure
			let storage = accessStorage(storageKey);
			if (!storage) {
				const newStorage: StorageEntry = {
					inputs: [],
					startTime: Date.now(),
					expectedCount: expectedInputs,
					lastAccessTime: Date.now(),
					metadata: {
						workflowId,
						nodeId,
						executionId,
					},
				};
				globalDataStore[storageKey] = newStorage;
				storage = newStorage;
			}

			// Update access time
			storage.lastAccessTime = Date.now();

			// Enhanced source identifier determination with multiple fallback strategies
			const sourceIdentifier = determineSourceIdentifier(items, storage.inputs.length);

			// Add current input data to storage with enhanced metadata
			const inputEntry = {
				data: items.length === 1 ? items[0].json : items.map((item) => item.json),
				timestamp: new Date().toISOString(),
				executionIndex: storage.inputs.length + 1,
				sourceIdentifier,
				itemCount: items.length,
				dataHash: generateDataHash(items), // For deduplication
				receivedAt: Date.now(),
			};
			
			// Check for duplicate inputs based on source identifier and data hash
			const isDuplicate = storage.inputs.some(existing => 
				existing.sourceIdentifier === sourceIdentifier && 
				existing.dataHash === inputEntry.dataHash
			);
			
			if (isDuplicate) {
				console.warn(`Join Node: Duplicate input detected from source ${sourceIdentifier}, ignoring`);
				return [[]]; // Return empty to prevent downstream execution
			}
			
			storage.inputs.push(inputEntry);

			// Check if we have all expected inputs
			if (storage.inputs.length < expectedInputs) {
				// Not all inputs received yet - check timeout
				const elapsed = Date.now() - storage.startTime;
				if (elapsed > timeout * 1000) {
					// Cleanup and throw timeout error
					delete globalDataStore[storageKey];
					throw new NodeOperationError(
						this.getNode(),
						`Timeout: Only received ${storage.inputs.length} of ${expectedInputs} expected inputs after ${timeout}s`,
					);
				}

				// Return empty result to prevent downstream execution
				// This execution will be "swallowed" - only the last one will produce output
				return [[]];
			}

			// All inputs received! Sort inputs deterministically for consistent output
			const sortedInputs = storage.inputs.sort((a: any, b: any) => {
				// Sort by sourceIdentifier for consistent ordering
				return a.sourceIdentifier.localeCompare(b.sourceIdentifier);
			});

			const combinedData: { [key: string]: any } = {};
			const metadata: { [key: string]: any } = {};

			// Process all collected inputs in sorted order
			for (let i = 0; i < sortedInputs.length; i++) {
				const input = sortedInputs[i];
				const label = `input_${i + 1}`;

				combinedData[label] = input.data;

				if (includeMetadata) {
					metadata[label] = {
						timestamp: input.timestamp,
						executionIndex: input.executionIndex,
						receivedAt: input.timestamp,
						sourceIdentifier: input.sourceIdentifier,
						itemCount: Array.isArray(input.data) ? input.data.length : 1,
						isArray: Array.isArray(input.data),
					};
				}
			}

			// Create final result with enhanced metadata
			const totalWaitTime = Date.now() - storage.startTime;
			const resultJson = includeMetadata
				? {
						data: combinedData,
						metadata: {
							...metadata,
							totalInputs: storage.inputs.length,
							executionTime: new Date().toISOString(),
							waitTime: `${(totalWaitTime / 1000).toFixed(3)}s`,
							storageKey,
							cleanupTime: new Date().toISOString(),
							performance: {
								averageInputSize: Math.round(
									storage.inputs.reduce((sum, input) => sum + (input.itemCount || 1), 0) / storage.inputs.length
								),
								totalWaitTimeMs: totalWaitTime,
							},
						},
					}
				: combinedData;

			// Enhanced cleanup with logging
			try {
				delete globalDataStore[storageKey];
				console.log(`Join Node: Successfully processed and cleaned up storage for ${storageKey} after ${(totalWaitTime / 1000).toFixed(3)}s`);
			} catch (cleanupError) {
				console.warn('Join Node: Error during storage cleanup:', cleanupError);
			}

			return [[{ json: resultJson }]];
		} catch (error) {
			// Enhanced error handling with better cleanup
			const workflowId = this.getWorkflow().id || 'unknown';
			const nodeId = this.getNode().id;
			const executionId = this.getExecutionId();
			const storageKey = `${workflowId}_${nodeId}_${executionId}`;
			
			// Attempt cleanup with error handling
			try {
				delete globalDataStore[storageKey];
				console.log(`Join Node: Cleaned up storage after error for ${storageKey}`);
			} catch (cleanupError) {
				console.warn('Join Node: Failed to cleanup storage after error:', cleanupError);
			}

			// Trigger aggressive cleanup if we have too many entries
			const currentEntries = Object.keys(globalDataStore).length;
			if (currentEntries > CLEANUP_CONFIG.MEMORY_PRESSURE_THRESHOLD) {
				console.warn(`Join Node: Memory pressure detected (${currentEntries} entries), triggering aggressive cleanup`);
				performCleanup(true);
			}

			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			throw new NodeOperationError(this.getNode(), `Join node failed: ${errorMessage}`);
		}
	}
}
