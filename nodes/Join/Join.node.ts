import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

// Global storage for collecting data across multiple executions
const globalDataStore: { [workflowId: string]: { [nodeId: string]: any } } = {};

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

			// Initialize storage for this execution if not exists
			if (!globalDataStore[storageKey]) {
				globalDataStore[storageKey] = {
					inputs: [],
					startTime: Date.now(),
					expectedCount: expectedInputs,
				};
			}

			const storage = globalDataStore[storageKey];

			// For now, use simple input_x naming since n8n API access to node names is very limited
			// This could be enhanced in the future with better workflow introspection
			let finalNodeName = `input_${storage.inputs.length + 1}`;

			// Add current input data to storage
			storage.inputs.push({
				data:
					items.length === 1
						? items[0].json // Single element directly
						: items.map((item) => item.json), // Array of JSON objects
				timestamp: new Date().toISOString(),
				executionIndex: storage.inputs.length + 1,
				nodeName: finalNodeName,
			});

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

			// All inputs received! Process and combine data
			const combinedData: { [key: string]: any } = {};
			const metadata: { [key: string]: any } = {};

			// Process all collected inputs
			for (let i = 0; i < storage.inputs.length; i++) {
				const input = storage.inputs[i];
				const label = `input_${i + 1}`;

				combinedData[label] = input.data;

				if (includeMetadata) {
					metadata[label] = {
						timestamp: input.timestamp,
						executionIndex: input.executionIndex,
						receivedAt: input.timestamp,
						itemCount: Array.isArray(input.data) ? input.data.length : 1,
						isArray: Array.isArray(input.data),
					};
				}
			}

			// Create final result
			const resultJson = includeMetadata
				? {
						data: combinedData,
						metadata: {
							...metadata,
							totalInputs: storage.inputs.length,
							executionTime: new Date().toISOString(),
							waitTime: `${(Date.now() - storage.startTime) / 1000}s`,
						},
					}
				: combinedData;

			// Cleanup storage
			delete globalDataStore[storageKey];

			return [[{ json: resultJson }]];
		} catch (error) {
			// Cleanup on error
			const workflowId = this.getWorkflow().id || 'unknown';
			const nodeId = this.getNode().id;
			const executionId = this.getExecutionId();
			const storageKey = `${workflowId}_${nodeId}_${executionId}`;
			delete globalDataStore[storageKey];

			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			throw new NodeOperationError(this.getNode(), `Join node failed: ${errorMessage}`);
		}
	}
}
