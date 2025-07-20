import { Join, globalDataStore } from '../../../nodes/Join/Join.node';
import { createMockExecuteFunctions } from '../../helpers/testHelpers';
import {
  INodeExecutionData,
  NodeOperationError,
} from 'n8n-workflow';

// Helper to clear global storage
function clearGlobalStorage() {
  Object.keys(globalDataStore).forEach(key => delete globalDataStore[key]);
}

describe('Join Node', () => {
  let joinNode: Join;

  beforeEach(() => {
    joinNode = new Join();
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
  });

  describe('Basic Execution Flow', () => {
    it('should throw error when no input data received', async () => {
      const mockExecuteFunctions = createMockExecuteFunctions() as any;
      mockExecuteFunctions.__setParameter('expectedInputs', 2);
      mockExecuteFunctions.__setParameter('timeout', 30);
      mockExecuteFunctions.__setParameter('includeMetadata', false);
      
      (mockExecuteFunctions.getInputData as jest.Mock) = jest.fn().mockReturnValue([]);

      await expect(joinNode.execute.call(mockExecuteFunctions))
        .rejects
        .toThrow(NodeOperationError);
    });

    it('should return empty array when waiting for more inputs', async () => {
      const mockExecuteFunctions = createMockExecuteFunctions() as any;
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
      // Create two separate execution contexts with same workflow/node but different execution IDs
      const mockFn1 = createMockExecuteFunctions('workflow-1', 'node-1', 'exec-1') as any;
      const mockFn2 = createMockExecuteFunctions('workflow-1', 'node-1', 'exec-1') as any; // Same execution context

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

    it('should handle single input completion immediately', async () => {
      const mockExecuteFunctions = createMockExecuteFunctions() as any;
      const inputData: INodeExecutionData[] = [{
        json: { data: 'single-input' },
      }];

      mockExecuteFunctions.__setParameter('expectedInputs', 1); // Only expecting 1 input
      mockExecuteFunctions.__setParameter('timeout', 30);
      mockExecuteFunctions.__setParameter('includeMetadata', false);
      
      (mockExecuteFunctions.getInputData as jest.Mock) = jest.fn().mockReturnValue(inputData);

      const result = await joinNode.execute.call(mockExecuteFunctions);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json).toHaveProperty('input_1');
      expect((result[0][0].json as any).input_1).toEqual({ data: 'single-input' });
    });
  });

  describe('Memory Management', () => {
    it('should store data in global storage during intermediate executions', async () => {
      const mockExecuteFunctions = createMockExecuteFunctions() as any;
      const inputData: INodeExecutionData[] = [{
        json: { test: 'data1' },
      }];

      mockExecuteFunctions.__setParameter('expectedInputs', 2);
      mockExecuteFunctions.__setParameter('timeout', 30);
      mockExecuteFunctions.__setParameter('includeMetadata', false);
      
      (mockExecuteFunctions.getInputData as jest.Mock) = jest.fn().mockReturnValue(inputData);

      // First execution should store data and return empty
      const result = await joinNode.execute.call(mockExecuteFunctions);
      expect(result).toEqual([[]]);
      
      // Check that data is stored in global storage
      expect(Object.keys(globalDataStore).length).toBeGreaterThan(0);
    });

    it('should cleanup storage after successful completion', async () => {
      const mockFn1 = createMockExecuteFunctions('workflow-1', 'node-1', 'exec-1') as any;
      const mockFn2 = createMockExecuteFunctions('workflow-1', 'node-1', 'exec-1') as any;

      const input1: INodeExecutionData[] = [{ json: { data: 'test1' } }];
      const input2: INodeExecutionData[] = [{ json: { data: 'test2' } }];

      [mockFn1, mockFn2].forEach(fn => {
        fn.__setParameter('expectedInputs', 2);
        fn.__setParameter('timeout', 30);
        fn.__setParameter('includeMetadata', false);
      });

      // First execution
      (mockFn1.getInputData as jest.Mock) = jest.fn().mockReturnValue(input1);
      await joinNode.execute.call(mockFn1);

      // Verify data is stored
      expect(Object.keys(globalDataStore).length).toBeGreaterThan(0);

      // Second execution (completion)
      (mockFn2.getInputData as jest.Mock) = jest.fn().mockReturnValue(input2);
      await joinNode.execute.call(mockFn2);

      // Verify storage was cleaned up
      expect(Object.keys(globalDataStore)).toHaveLength(0);
    });
  });

  describe('Metadata Support', () => {
    it('should include metadata when enabled', async () => {
      const mockExecuteFunctions = createMockExecuteFunctions() as any;
      const inputData: INodeExecutionData[] = [{
        json: { data: 'test' },
        pairedItem: { item: 0 }
      }];

      mockExecuteFunctions.__setParameter('expectedInputs', 1);
      mockExecuteFunctions.__setParameter('timeout', 30);
      mockExecuteFunctions.__setParameter('includeMetadata', true); // Enable metadata
      
      (mockExecuteFunctions.getInputData as jest.Mock) = jest.fn().mockReturnValue(inputData);

      const result = await joinNode.execute.call(mockExecuteFunctions);
      const output = result[0][0].json as any;
      
      expect(output).toHaveProperty('data');
      expect(output).toHaveProperty('metadata');
      expect(output.data.input_1).toEqual({ data: 'test' });
      expect(output.metadata.input_1).toMatchObject({
        executionIndex: expect.any(Number),
        sourceIdentifier: expect.any(String),
        itemCount: 1,
        isArray: false,
      });
    });

    it('should not include metadata when disabled', async () => {
      const mockExecuteFunctions = createMockExecuteFunctions() as any;
      const inputData: INodeExecutionData[] = [{
        json: { data: 'test' },
      }];

      mockExecuteFunctions.__setParameter('expectedInputs', 1);
      mockExecuteFunctions.__setParameter('timeout', 30);
      mockExecuteFunctions.__setParameter('includeMetadata', false); // Disable metadata
      
      (mockExecuteFunctions.getInputData as jest.Mock) = jest.fn().mockReturnValue(inputData);

      const result = await joinNode.execute.call(mockExecuteFunctions);
      const output = result[0][0].json;
      
      expect(output).not.toHaveProperty('metadata');
      expect(output).toHaveProperty('input_1');
    });
  });

  describe('Error Handling', () => {
    it('should cleanup storage on execution error', async () => {
      const mockExecuteFunctions = createMockExecuteFunctions() as any;
      
      mockExecuteFunctions.__setParameter('expectedInputs', 2);
      mockExecuteFunctions.__setParameter('timeout', 30);
      mockExecuteFunctions.__setParameter('includeMetadata', false);
      
      // Force an error by making getInputData throw
      (mockExecuteFunctions.getInputData as jest.Mock) = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      await expect(joinNode.execute.call(mockExecuteFunctions))
        .rejects
        .toThrow('Join node failed: Test error');

      // Verify storage was cleaned up (should be empty since error occurred before storage)
      expect(Object.keys(globalDataStore)).toHaveLength(0);
    });

    it('should handle missing pairedItem gracefully', async () => {
      const mockExecuteFunctions = createMockExecuteFunctions() as any;
      const inputWithoutPairedItem: INodeExecutionData[] = [{
        json: { data: 'test' }
        // No pairedItem property
      }];

      mockExecuteFunctions.__setParameter('expectedInputs', 1); // expecting only 1 input for immediate completion
      mockExecuteFunctions.__setParameter('timeout', 30);
      mockExecuteFunctions.__setParameter('includeMetadata', false);
      
      (mockExecuteFunctions.getInputData as jest.Mock) = jest.fn().mockReturnValue(inputWithoutPairedItem);

      const result = await joinNode.execute.call(mockExecuteFunctions);
      
      expect(result[0][0].json).toHaveProperty('input_1');
      expect((result[0][0].json as any).input_1).toEqual({ data: 'test' });
    });
  });

  describe('Source Identifier Logic', () => {
    it('should handle object pairedItem correctly', async () => {
      const mockExecuteFunctions = createMockExecuteFunctions() as any;
      const inputWithObjectPairedItem: INodeExecutionData[] = [{
        json: { data: 'test' },
        pairedItem: { item: 3 } // Object format
      }];

      mockExecuteFunctions.__setParameter('expectedInputs', 1);
      mockExecuteFunctions.__setParameter('timeout', 30);
      mockExecuteFunctions.__setParameter('includeMetadata', true);
      
      (mockExecuteFunctions.getInputData as jest.Mock) = jest.fn().mockReturnValue(inputWithObjectPairedItem);

      const result = await joinNode.execute.call(mockExecuteFunctions);
      const metadata = (result[0][0].json as any).metadata;
      
      expect(metadata.input_1.sourceIdentifier).toBe('source_3');
    });

    it('should use fallback when pairedItem extraction fails', async () => {
      const mockExecuteFunctions = createMockExecuteFunctions() as any;
      const inputWithBadPairedItem: INodeExecutionData[] = [{
        json: { data: 'test' },
        pairedItem: 'invalid' as any // Invalid format
      }];

      mockExecuteFunctions.__setParameter('expectedInputs', 1);
      mockExecuteFunctions.__setParameter('timeout', 30);
      mockExecuteFunctions.__setParameter('includeMetadata', true);
      
      (mockExecuteFunctions.getInputData as jest.Mock) = jest.fn().mockReturnValue(inputWithBadPairedItem);

      const result = await joinNode.execute.call(mockExecuteFunctions);
      const metadata = (result[0][0].json as any).metadata;
      
      expect(metadata.input_1.sourceIdentifier).toBe('source_invalid');
    });
  });
});
