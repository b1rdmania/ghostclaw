---
name: readme-generator
description: Generates comprehensive README.md files for software projects by analyzing codebase structure
allowed-tools: ["Read", "Glob", "Grep", "Write"]
version: 1.0.0
author: GLINCKER Team
license: Apache-2.0
keywords: [documentation, readme, markdown, project]
---

# README Generator

Automatically generates professional, comprehensive README.md files by analyzing your project structure, dependencies, and code patterns.

## What This Skill Does

This skill helps you create high-quality README files by:
- Analyzing project structure and identifying key components
- Detecting programming languages and frameworks
- Finding configuration files (package.json, requirements.txt, etc.)
- Identifying test frameworks and CI/CD setup
- Generating appropriate sections with relevant content
- Following README best practices

## Instructions

When generating a README, follow these steps:

### 1. Project Discovery

First, analyze the project structure:
- Use Glob to find key files: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc.
- Use Glob to identify main source directories
- Use Read to examine configuration files
- Use Grep to find test files and CI configuration

### 2. Content Analysis

Based on findings, determine:
- Project type (library, application, CLI tool, etc.)
- Primary programming language(s)
- Dependencies and frameworks
- Build and test commands
- License type (from LICENSE file)

### 3. README Generation

Create a README.md with these sections (adapt based on project type):

**Required Sections:**
- **Title and Description**: Project name and one-line summary
- **Features**: Key functionality (if applicable)
- **Installation**: How to install/set up
- **Usage**: Basic usage examples
- **License**: License information

**Optional Sections** (include if relevant):
- **Prerequisites**: Required software/tools
- **Development**: How to set up for development
- **Testing**: How to run tests
- **Contributing**: Contribution guidelines
- **API Documentation**: For libraries
- **Screenshots**: For applications with UI
- **Roadmap**: Future plans
- **Acknowledgments**: Credits and thanks

### 4. Writing Style

Use this style for generated READMEs:
- Clear, concise language
- Active voice
- Code blocks with proper syntax highlighting
- Badge shields for status indicators (if CI/CD detected)
- Emoji sparingly (only if user requests)
- Professional but approachable tone

### 5. Output

Present the generated README to the user and offer to:
- Write it to README.md
- Make adjustments based on feedback
- Add additional sections

## Examples

### Example 1: Python Project

**User Request:**
"Generate a README for this Python project"

**Workflow:**
1. Glob for Python files: `**/*.py`
2. Read `pyproject.toml` or `setup.py`
3. Check for `requirements.txt`, `Pipfile`
4. Look for test files in `tests/` or `*_test.py`
5. Generate README with:
   - Installation via pip
   - Python version requirements
   - Virtual environment setup
   - Testing with pytest/unittest

### Example 2: Node.js Project

**User Request:**
"Create a README for my npm package"

**Workflow:**
1. Read `package.json` for name, description, scripts
2. Identify framework (React, Vue, Express, etc.)
3. Check for TypeScript (`tsconfig.json`)
4. Look for test configuration (Jest, Mocha)
5. Generate README with:
   - npm/yarn installation
   - Available scripts
   - API documentation (for packages)
   - Usage examples

## Configuration

This skill adapts to project type:

| Project Type | Key Files | Focus Areas |
|--------------|-----------|-------------|
| Python | `pyproject.toml`, `setup.py` | pip install, virtual env |
| Node.js | `package.json` | npm install, scripts |
| Rust | `Cargo.toml` | cargo build, features |
| Go | `go.mod` | go get, modules |
| Generic | None | Basic structure |

## Tool Requirements

- **Read**: Examine configuration and source files
- **Glob**: Find relevant files across project
- **Grep**: Search for patterns (tests, CI, etc.)
- **Write**: Create the README.md file

## Limitations

- Cannot include screenshots (user must add manually)
- May miss custom build processes not in standard files
- Generates starting point - user should review and customize
- Works best with standard project structures
- Does not analyze actual code logic for features

## Best Practices

When using this skill:

1. **Run from project root**: Ensure you're in the main project directory
2. **Review before writing**: Check generated content before writing to file
3. **Customize**: Treat output as a template, add project-specific details
4. **Update regularly**: Regenerate when project structure changes significantly
5. **Backup existing**: If README.md exists, back it up first

## Error Handling

- **No project files found**: Ask user to confirm working directory
- **Multiple languages detected**: Generate sections for each, note polyglot nature
- **Existing README**: Prompt user before overwriting, offer to merge
- **Missing key info**: Generate placeholder sections with TODO markers

## Related Skills

- [changelog-generator](../../automation/changelog-generator/SKILL.md) - Create CHANGELOG.md
- [api-doc-generator](../api-doc-generator/SKILL.md) - Generate API documentation
- [license-picker](../../automation/license-picker/SKILL.md) - Add license files

## Changelog

### Version 1.0.0 (2025-01-13)
- Initial release
- Support for Python, Node.js, Rust, Go projects
- Automatic dependency detection
- Standard section generation

## Contributing

Found a bug or want to add support for a new project type? Please:
1. Open an issue with details
2. Submit a PR with improvements
3. Follow [Contributing Guidelines](../../../docs/CONTRIBUTING.md)

## License

Apache License 2.0 - See [LICENSE](../../../LICENSE)

## Author

**GLINCKER Team**
- GitHub: [@GLINCKER](https://github.com/GLINCKER)
- Repository: [claude-code-marketplace](https://github.com/GLINCKER/claude-code-marketplace)
