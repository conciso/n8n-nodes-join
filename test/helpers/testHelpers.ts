import {
  IExecuteFunctions,
  IWorkflowMetadata,
  INode,
} from 'n8n-workflow';

/**
 * Creates a mock IExecuteFunctions for testing
 */
export function createMockExecuteFunctions(
  workflowId: string = 'test-workflow-123',
  nodeId: string = 'test-node-456',
  executionId: string = 'test-execution-789'
): Partial<IExecuteFunctions> {
  const mockParams: { [key: string]: any } = {};
  
  return {
    getWorkflow: jest.fn().mockReturnValue({
      id: workflowId,
    } as IWorkflowMetadata),
    
    getNode: jest.fn().mockReturnValue({
      id: nodeId,
      name: 'Join Test Node',
      type: 'join',
    } as INode),
    
    getExecutionId: jest.fn().mockReturnValue(executionId),
    
    getNodeParameter: jest.fn().mockImplementation((paramName: string, _itemIndex: number, defaultValue?: any) => {
      return mockParams[paramName] ?? defaultValue;
    }),
    
    getInputData: jest.fn().mockReturnValue([]),
    
    // Helper to set parameters for tests
    __setParameter: (name: string, value: any) => {
      mockParams[name] = value;
    },
  } as any;
}

/**
 * Waits for a specified time - used in timeout tests
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
