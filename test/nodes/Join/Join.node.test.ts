import { Join } from '../../../nodes/Join/Join.node';
import { createMockExecuteFunctions } from '../../helpers/testHelpers';
import {
  IExecuteFunctions,
  INodeExecutionData,
  NodeOperationError,
} from 'n8n-workflow';

// Helper to clear global storage
function clearGlobalStorage() {
  const joinModule = require('../../../nodes/Join/Join.node');
  const globalDataStore = joinModule.globalDataStore || {};
  Object.keys(globalDataStore).forEach(key => delete globalDataStore[key]);
}

describe('Join Node', () => {
  let joinNode: Join;
  let mockExecuteFunctions: IExecuteFunctions & { __setParameter: (name: string, value: any) => void };

  beforeEach(() => {
    joinNode = new Join();
    mockExecuteFunctions = createMockExecuteFunctions() as any;
    clearGlobalStorage();
  });

  afterEach(() => {
    clearGlobalStorage();
  });

  describe('Node Configuration', () => {
    it('should have correct node description properties', () => {
      const description = joinNode.description;
      
      expect(description.displayName).toBe('Join');
      expect(description.name).toBe('join');
      expect(description.group).toContain('transform');
      expect(description.version).toBe(1);
    });

    it('should have three configuration parameters', () => {
      const properties = joinNode.description.properties;
      
      expect(properties).toHaveLength(3);
      expect(properties[0].name).toBe('expectedInputs');
      expect(properties[1].name).toBe('timeout');
      expect(properties[2].name).toBe('includeMetadata');
    });

    it('should have valid parameter defaults and constraints', () => {
      const properties = joinNode.description.properties;
      
      // Expected Inputs parameter
      const expectedInputsParam = properties.find(p => p.name === 'expectedInputs');
      expect(expectedInputsParam?.default).toBe(2);
      expect((expectedInputsParam?.typeOptions as any)?.minValue).toBe(2);
      expect((expectedInputsParam?.typeOptions as any)?.maxValue).toBe(99);
      
      // Timeout parameter
      const timeoutParam = properties.find(p => p.name === 'timeout');
      expect(timeoutParam?.default).toBe(30);
      
      // Include Metadata parameter
      const metadataParam = properties.find(p => p.name === 'includeMetadata');
      expect(metadataParam?.default).toBe(false);
    });
  });

  describe('Basic Execution Flow', () => {
    it('should throw error when no input data received', async () => {
      mockExecuteFunctions.__setParameter('expectedInputs', 2);
      mockExecuteFunctions.__setParameter('timeout', 30);
      mockExecuteFunctions.__setParameter('includeMetadata', false);
      
      (mockExecuteFunctions.getInputData as jest.Mock) = jest.fn().mockReturnValue([]);

      await expect(joinNode.execute.call(mockExecuteFunctions))
        .rejects
        .toThrow(NodeOperationError);
    });

    it('should return empty array when waiting for more inputs', async () => {
      const inputData: INodeExecutionData[] = [{
        json: { test: 'data1' },
      }];

      mockExecuteFunctions.__setParameter('expectedInputs', 3); // expecting 3, but only got 1
      mockExecuteFunctions.__setParameter('timeout', 30);
      mockExecuteFunctions.__setParameter('includeMetadata', false);
      
      (mockExecuteFunctions.getInputData as jest.Mock) = jest.fn().mockReturnValue(inputData);

      const result = await joinNode.execute.call(mockExecuteFunctions);
      expect(result).toEqual([[]]);
    });
  });

  describe('Parallel Input Synchronization', () => {
    it('should collect and combine two parallel inputs', async () => {
      // Create two separate execution contexts but same workflow/node IDs
      const mockFn1 = createMockExecuteFunctions('workflow-1', 'node-1', 'exec-1') as any;
      const mockFn2 = createMockExecuteFunctions('workflow-1', 'node-1', 'exec-1') as any; // Same IDs

      const input1: INodeExecutionData[] = [{
        json: { users: [{ id: 1, name: 'John' }] },
        pairedItem: { item: 0 }
      }];
      
      const input2: INodeExecutionData[] = [{
        json: { orders: [{ id: 101, total: 99.99 }] },
        pairedItem: { item: 1 }
      }];

      // Setup both functions with same parameters
      [mockFn1, mockFn2].forEach(fn => {
        fn.__setParameter('expectedInputs', 2);
        fn.__setParameter('timeout', 30);
        fn.__setParameter('includeMetadata', false);
      });

      // First execution - input 1
      (mockFn1.getInputData as jest.Mock) = jest.fn().mockReturnValue(input1);
      const result1 = await joinNode.execute.call(mockFn1);
      expect(result1).toEqual([[]]);

      // Second execution - input 2 (should trigger output)
      (mockFn2.getInputData as jest.Mock) = jest.fn().mockReturnValue(input2);
      const result2 = await joinNode.execute.call(mockFn2);

      expect(result2).toHaveLength(1);
      expect(result2[0]).toHaveLength(1);
      
      const output = result2[0][0].json;
      expect(output).toHaveProperty('input_1');
      expect(output).toHaveProperty('input_2');
    });

    it('should handle multiple items in single input correctly', async () => {
      const multiItemInput: INodeExecutionData[] = [
        { json: { item: 1 }, pairedItem: { item: 0 } },
        { json: { item: 2 }, pairedItem: { item: 0 } }
      ];
      
      const singleItemInput: INodeExecutionData[] = [{
        json: { single: 'value' },
        pairedItem: { item: 1 }
      }];

      mockExecuteFunctions.__setParameter('expectedInputs', 2);
      mockExecuteFunctions.__setParameter('timeout', 30);
      mockExecuteFunctions.__setParameter('includeMetadata', false);

      // First execution - multi-item input
      (mockExecuteFunctions.getInputData as jest.Mock) = jest.fn().mockReturnValue(multiItemInput);
      await joinNode.execute.call(mockExecuteFunctions);

      // Second execution - single item input
      (mockExecuteFunctions.getInputData as jest.Mock) = jest.fn().mockReturnValue(singleItemInput);
      const result = await joinNode.execute.call(mockExecuteFunctions);

      const output = result[0][0].json;
      expect(output.input_1).toEqual([{ item: 1 }, { item: 2 }]); // Array for multiple items
      expect(output.input_2).toEqual({ single: 'value' }); // Single object for one item
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout when not all inputs received within time limit', async () => {
      const inputData: INodeExecutionData[] = [{
        json: { test: 'data1' },
      }];

      // Use same execution context for timeout test
      const workflowId = 'timeout-test-workflow';
      const nodeId = 'timeout-test-node';
      const executionId = 'timeout-test-execution';

      const mockFn1 = createMockExecuteFunctions(workflowId, nodeId, executionId) as any;
      mockFn1.__setParameter('expectedInputs', 3); // Expect 3 inputs but only provide 1
      mockFn1.__setParameter('timeout', 0.1); // 100ms timeout
      mockFn1.__setParameter('includeMetadata', false);
      
      (mockFn1.getInputData as jest.Mock) = jest.fn().mockReturnValue(inputData);

      // First execution - should store input and return empty (waiting for more inputs)
      const result1 = await joinNode.execute.call(mockFn1);
      expect(result1).toEqual([[]]);

      // Wait for timeout to occur
      await new Promise(resolve => setTimeout(resolve, 150));

      // Try to add another input but this should timeout since we're past the deadline
      const mockFn2 = createMockExecuteFunctions(workflowId, nodeId, executionId) as any;
      mockFn2.__setParameter('expectedInputs', 3);
      mockFn2.__setParameter('timeout', 0.1);
      mockFn2.__setParameter('includeMetadata', false);
      
      const secondInputData: INodeExecutionData[] = [{
        json: { test: 'data2' },
        pairedItem: { item: 1 }
      }];
      (mockFn2.getInputData as jest.Mock) = jest.fn().mockReturnValue(secondInputData);

      // This should timeout since we only have 2 of 3 expected inputs and time is up
      await expect(joinNode.execute.call(mockFn2))
        .rejects
        .toThrow('Timeout: Only received 2 of 3 expected inputs after 0.1s');
    });
  });

  describe('Metadata Support', () => {
    it('should include metadata when enabled', async () => {
      const input1: INodeExecutionData[] = [{
        json: { data: 'test1' },
        pairedItem: { item: 0 }
      }];
      
      const input2: INodeExecutionData[] = [{
        json: { data: 'test2' },
        pairedItem: { item: 1 }
      }];

      const mockFn1 = createMockExecuteFunctions('workflow-1', 'node-1', 'exec-1') as any;
      const mockFn2 = createMockExecuteFunctions('workflow-1', 'node-1', 'exec-1') as any;

      [mockFn1, mockFn2].forEach(fn => {
        fn.__setParameter('expectedInputs', 2);
        fn.__setParameter('timeout', 30);
        fn.__setParameter('includeMetadata', true); // Enable metadata
      });
      
      // First execution
      (mockFn1.getInputData as jest.Mock) = jest.fn().mockReturnValue(input1);
      await joinNode.execute.call(mockFn1);

      // Second execution
      (mockFn2.getInputData as jest.Mock) = jest.fn().mockReturnValue(input2);
      const result = await joinNode.execute.call(mockFn2);

      const output = result[0][0].json as any;
      expect(output).toHaveProperty('data');
      expect(output).toHaveProperty('metadata');
      
      expect(output.data.input_1).toEqual({ data: 'test1' });
      expect(output.data.input_2).toEqual({ data: 'test2' });
      
      expect(output.metadata.input_1).toMatchObject({
        executionIndex: expect.any(Number),
        sourceIdentifier: expect.any(String),
        itemCount: 1,
        isArray: false,
      });
      
      expect(output.metadata.totalInputs).toBe(2);
      expect(output.metadata.waitTime).toMatch(/^\d+(\.\d+)?s$/);
    });

    it('should not include metadata when disabled', async () => {
      const input1: INodeExecutionData[] = [{
        json: { data: 'test1' },
        pairedItem: { item: 0 }
      }];
      
      const input2: INodeExecutionData[] = [{
        json: { data: 'test2' },
        pairedItem: { item: 1 }
      }];

      const mockFn1 = createMockExecuteFunctions('workflow-1', 'node-1', 'exec-1') as any;
      const mockFn2 = createMockExecuteFunctions('workflow-1', 'node-1', 'exec-1') as any;

      [mockFn1, mockFn2].forEach(fn => {
        fn.__setParameter('expectedInputs', 2);
        fn.__setParameter('timeout', 30);
        fn.__setParameter('includeMetadata', false); // Disable metadata
      });
      
      // First execution
      (mockFn1.getInputData as jest.Mock) = jest.fn().mockReturnValue(input1);
      await joinNode.execute.call(mockFn1);

      // Second execution
      (mockFn2.getInputData as jest.Mock) = jest.fn().mockReturnValue(input2);
      const result = await joinNode.execute.call(mockFn2);

      const output = result[0][0].json;
      expect(output).not.toHaveProperty('metadata');
      expect(output).toHaveProperty('input_1');
      expect(output).toHaveProperty('input_2');
    });
  });

  describe('Error Handling', () => {
    it('should cleanup storage on execution error', async () => {
      const mockFn = createMockExecuteFunctions() as any;
      mockFn.__setParameter('expectedInputs', 2);
      mockFn.__setParameter('timeout', 30);
      mockFn.__setParameter('includeMetadata', false);
      
      // Force an error by making getInputData throw
      (mockFn.getInputData as jest.Mock) = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      await expect(joinNode.execute.call(mockFn))
        .rejects
        .toThrow('Join node failed: Test error');
    });

    it('should handle missing pairedItem gracefully', async () => {
      const inputWithoutPairedItem: INodeExecutionData[] = [{
        json: { data: 'test' }
        // No pairedItem property
      }];

      const mockFn = createMockExecuteFunctions() as any;
      mockFn.__setParameter('expectedInputs', 1); // expecting only 1 input for immediate completion
      mockFn.__setParameter('timeout', 30);
      mockFn.__setParameter('includeMetadata', false);
      
      (mockFn.getInputData as jest.Mock) = jest.fn().mockReturnValue(inputWithoutPairedItem);

      const result = await joinNode.execute.call(mockFn);
      
      expect(result[0][0].json).toHaveProperty('input_1');
      expect((result[0][0].json as any).input_1).toEqual({ data: 'test' });
    });
  });

  describe('Source Identifier Logic', () => {
    it('should handle array pairedItem correctly', async () => {
      const inputWithArrayPairedItem: INodeExecutionData[] = [{
        json: { data: 'test' },
        pairedItem: [{ item: 5 }, { item: 6 }] // Array format
      }];

      const mockFn = createMockExecuteFunctions() as any;
      mockFn.__setParameter('expectedInputs', 1);
      mockFn.__setParameter('timeout', 30);
      mockFn.__setParameter('includeMetadata', true); // Enable metadata to see sourceIdentifier
      
      (mockFn.getInputData as jest.Mock) = jest.fn().mockReturnValue(inputWithArrayPairedItem);

      const result = await joinNode.execute.call(mockFn);
      const metadata = (result[0][0].json as any).metadata;
      
      expect(metadata.input_1.sourceIdentifier).toBe('source_5');
    });

    it('should handle object pairedItem correctly', async () => {
      const inputWithObjectPairedItem: INodeExecutionData[] = [{
        json: { data: 'test' },
        pairedItem: { item: 3 } // Object format
      }];

      const mockFn = createMockExecuteFunctions() as any;
      mockFn.__setParameter('expectedInputs', 1);
      mockFn.__setParameter('timeout', 30);
      mockFn.__setParameter('includeMetadata', true);
      
      (mockFn.getInputData as jest.Mock) = jest.fn().mockReturnValue(inputWithObjectPairedItem);

      const result = await joinNode.execute.call(mockFn);
      const metadata = (result[0][0].json as any).metadata;
      
      expect(metadata.input_1.sourceIdentifier).toBe('source_3');
    });

    it('should use fallback when pairedItem extraction fails', async () => {
      const inputWithBadPairedItem: INodeExecutionData[] = [{
        json: { data: 'test' },
        pairedItem: 'invalid' as any // Invalid format
      }];

      const mockFn = createMockExecuteFunctions() as any;
      mockFn.__setParameter('expectedInputs', 1);
      mockFn.__setParameter('timeout', 30);
      mockFn.__setParameter('includeMetadata', true);
      
      (mockFn.getInputData as jest.Mock) = jest.fn().mockReturnValue(inputWithBadPairedItem);

      const result = await joinNode.execute.call(mockFn);
      const metadata = (result[0][0].json as any).metadata;
      
      expect(metadata.input_1.sourceIdentifier).toBe('source_invalid');
    });
  });
});
