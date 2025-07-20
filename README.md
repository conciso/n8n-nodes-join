# 🔗 n8n-nodes-join

A powerful n8n Community Node for joining parallel workflow branches into a single JSON object. This node waits for all parallel inputs to complete and combines their data with automatic node name detection and intelligent error handling.

[![npm version](https://img.shields.io/npm/v/@conciso/n8n-nodes-join.svg)](https://www.npmjs.com/package/@conciso/n8n-nodes-join)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

### 🔄 **Join Node**
- **True Parallel Join**: Waits for ALL parallel inputs before executing downstream
- **Configurable Input Count**: Set expected number of inputs (2-99)
- **Smart Synchronization**: Uses global storage to collect data across executions
- **Timeout Protection**: Configurable timeout to prevent infinite waiting
- **Smart Labeling**: Uses `input_1`, `input_2`, etc. as keys
- **Metadata Support**: Optional execution metadata and timing information
- **Single Output**: Guarantees downstream nodes execute exactly once

### 🛡️ **Quality Assurance**
- **TypeScript**: Full type safety and IntelliSense support
- **Professional Error Messages**: Clear, actionable error messages
- **Timeout Handling**: Configurable timeout for parallel operations

## 📦 Installation

Install the node using n8n's Community Nodes feature:

1. **Via n8n Interface:**
   - Go to **Settings** → **Community Nodes**
   - Install package: `@conciso/n8n-nodes-join`

2. **Via npm (for self-hosted n8n):**
   ```bash
   npm install @conciso/n8n-nodes-join
   ```

For detailed installation instructions, see the [n8n Community Nodes documentation](https://docs.n8n.io/integrations/community-nodes/installation/).

## 🚀 Usage

### Problem Solved

In n8n workflows, when you connect multiple parallel nodes to a single downstream node, the downstream node executes multiple times (once for each input). The Join node solves this by:

**Before (Multiple Executions):**
```
API Call 1 ──┐
API Call 2 ──┤── Process Data (executes 3 times!)
API Call 3 ──┘
```

**After (Single Execution):**
```
API Call 1 ──┐
API Call 2 ──┤── [JOIN] ──> Process Data (executes 1 time)
API Call 3 ──┘
```

### Basic Usage

1. **Add parallel nodes** to your workflow (API calls, data processing, etc.)
2. **Connect all parallel nodes** to the Join node
3. **Connect the Join node** to your downstream processing node
4. **Configure timeout** and error handling if needed

### Output Structure

The Join node automatically creates a JSON object with `input_x` keys:

```json
{
  "input_1": {
    "users": [{"id": 1, "name": "John"}, {"id": 2, "name": "Jane"}]
  },
  "input_2": {
    "orders": [{"id": 101, "total": 99.99}]
  },
  "input_3": {
    "processed": true,
    "timestamp": "2025-01-16T21:30:00Z"
  }
}
```

### With Metadata

Enable "Include Metadata" for additional execution information:

```json
{
  "data": {
    "input_1": { "users": [...] },
    "input_2": { "orders": [...] },
    "input_3": { "processed": true }
  },
  "metadata": {
    "input_1": {
      "timestamp": "2025-01-16T21:30:15Z",
      "executionIndex": 1
    },
    "input_2": {
      "timestamp": "2025-01-16T21:30:16Z", 
      "executionIndex": 2
    },
    "input_3": {
      "timestamp": "2025-01-16T21:30:17Z",
      "executionIndex": 3
    },
    "totalInputs": 3,
    "executionTime": "2025-01-16T21:30:17Z",
    "waitTime": "2.1s"
  }
}
```

## ⚙️ Configuration

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| **Expected Inputs** | Number | 2 | Number of parallel inputs to wait for (2-99) |
| **Timeout (seconds)** | Number | 30 | Maximum time to wait for all inputs |
| **Include Metadata** | Boolean | false | Include execution metadata in output |

## 💡 Use Cases

### 1. **Parallel API Data Gathering**
```
Get Users API    ──┐
Get Orders API   ──┤── [JOIN] ──> Generate Report
Get Products API ──┘
```

### 2. **Multi-Source Data Processing**
```
Database Query ──┐
File Processing ──┤── [JOIN] ──> Data Analysis
Web Scraping ──┘
```

### 3. **Conditional Workflow Merging**
```
IF: Process A ──┐
IF: Process B ──┤── [JOIN] ──> Final Processing
IF: Process C ──┘
```

## 🔧 Development

### Prerequisites

- Node.js 20+
- npm 8+
- n8n development environment

### Setup

```bash
# Clone the repository
git clone https://github.com/conciso/n8n-nodes-join.git
cd n8n-nodes-join

# Install dependencies
npm run init

# Build and run in dev mode
npm run dev
```

### Project Structure

```
n8n-nodes-join/
├── nodes/
│   └── Join/
│       ├── Join.node.ts      # Main node implementation
│       ├── Join.node.json    # Node metadata
│       └── join.svg          # Node icon
├── dist/  
├── test/                    # Test files
├── gulpfile.js              # Build system
└── package.json             # Package configuration
```

## 🤝 Contributing

Contributions are welcome!

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run build and tests: `npm run build:test`
5. Submit a pull request

## 🐛 Troubleshooting

### Common Issues

**❌ "No input data received" Error**
- Ensure all parallel nodes are connected to the Join node
- Check that upstream nodes are producing data

**❌ Timeout Issues**
- Increase the timeout value in node configuration
- Check for slow upstream operations

**❌ Wrong Expected Inputs Configuration**
- Ensure "Expected Inputs" matches the actual number of connected parallel nodes
- If you have 4 parallel nodes, set "Expected Inputs" to 4
- The node will timeout if it doesn't receive the expected number of inputs

## 📚 Resources

- [n8n Community Nodes Documentation](https://docs.n8n.io/integrations/community-nodes/)
- [n8n Node Development Guide](https://docs.n8n.io/integrations/creating-nodes/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built for the [n8n](https://n8n.io) automation platform
- Inspired by the n8n community's need for better parallel workflow handling

---

**Made with ❤️ for the n8n community**
