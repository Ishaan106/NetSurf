/**
 * ElectronFileAgent
 * Custom File Agent for Eko that handles local file system operations within Electron
 */

import { Agent, AgentContext } from '@jarvis-agent/core';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// Define Tool types locally to match Eko's interface (per docss/agents/agent-tools.md)
interface ToolResult {
    isError?: boolean;
    content: Array<{ type: string; text: string }>;
}

interface Tool {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, { type: string; description: string; default?: unknown }>;
        required?: string[];
    };
    execute: (
        args: Record<string, unknown>,
        agentContext: AgentContext
    ) => Promise<ToolResult>;
}

/**
 * Resolve path with support for common shortcuts like "desktop", "documents", etc.
 */
function resolvePath(inputPath: string): string {
    const trimmedPath = inputPath.trim();
    const lowerPath = trimmedPath.toLowerCase();
    
    // Helper to extract the relative part after a prefix (case-insensitive)
    const getRelativePart = (prefix: string): string => {
        // Check for both forward and back slash
        if (lowerPath === prefix) return '';
        if (lowerPath.startsWith(prefix + '/')) return trimmedPath.substring(prefix.length + 1);
        if (lowerPath.startsWith(prefix + '\\')) return trimmedPath.substring(prefix.length + 1);
        return '';
    };
    
    // Handle common path shortcuts
    if (lowerPath === 'desktop' || lowerPath.startsWith('desktop/') || lowerPath.startsWith('desktop\\')) {
        const desktopPath = app.getPath('desktop');
        const relativePart = getRelativePart('desktop');
        return relativePart ? path.join(desktopPath, relativePart) : desktopPath;
    }
    if (lowerPath === 'documents' || lowerPath.startsWith('documents/') || lowerPath.startsWith('documents\\')) {
        const documentsPath = app.getPath('documents');
        const relativePart = getRelativePart('documents');
        return relativePart ? path.join(documentsPath, relativePart) : documentsPath;
    }
    if (lowerPath === 'downloads' || lowerPath.startsWith('downloads/') || lowerPath.startsWith('downloads\\')) {
        const downloadsPath = app.getPath('downloads');
        const relativePart = getRelativePart('downloads');
        return relativePart ? path.join(downloadsPath, relativePart) : downloadsPath;
    }
    if (lowerPath === 'home' || lowerPath.startsWith('home/') || lowerPath.startsWith('home\\')) {
        const homePath = app.getPath('home');
        const relativePart = getRelativePart('home');
        return relativePart ? path.join(homePath, relativePart) : homePath;
    }
    
    // Return as-is if it's an absolute path or relative path
    return path.resolve(trimmedPath);
}

/**
 * Recursively search for files matching a query in a directory
 */
function searchFilesRecursive(
    dirPath: string, 
    query: string, 
    results: string[] = [], 
    maxDepth: number = 3,
    currentDepth: number = 0
): string[] {
    if (currentDepth > maxDepth) return results;
    
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const lowerQuery = query.toLowerCase();
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            // Check if name matches query
            if (entry.name.toLowerCase().includes(lowerQuery)) {
                results.push(fullPath);
            }
            
            // Recurse into directories (skip node_modules, .git, etc.)
            if (entry.isDirectory() && 
                !entry.name.startsWith('.') && 
                entry.name !== 'node_modules') {
                searchFilesRecursive(fullPath, query, results, maxDepth, currentDepth + 1);
            }
        }
    } catch (error) {
        // Silently skip directories we can't access
    }
    
    return results;
}

/**
 * Create file system tools for the agent
 * Each tool is atomic - one tool = one action (per Eko design philosophy)
 */
function createFileTools(): Tool[] {
    return [
        // ═══════════════════════════════════════════════════════════════════
        // Tool: read_file
        // Purpose: Read text file contents
        // ═══════════════════════════════════════════════════════════════════
        {
            name: 'read_file',
            description: `Read the contents of a text file from the local file system.
Supports path shortcuts: 'desktop', 'documents', 'downloads', 'home'.
Example: 'desktop/notes.txt' reads from the user's desktop.
Returns the file content as text, or an error if the file doesn't exist.`,
            parameters: {
                type: 'object',
                properties: {
                    filePath: {
                        type: 'string',
                        description: 'Path to the file to read. Can be absolute path or use shortcuts like "desktop/file.txt"',
                    },
                    encoding: {
                        type: 'string',
                        description: 'Character encoding (default: utf-8)',
                        default: 'utf-8',
                    },
                },
                required: ['filePath'],
            },
            execute: async (
                args: Record<string, unknown>,
                _agentContext: AgentContext
            ): Promise<ToolResult> => {
                const filePath = resolvePath(args.filePath as string);
                const encoding = (args.encoding as BufferEncoding) || 'utf-8';
                
                console.log('[ElectronFileAgent] read_file:', filePath);

                try {
                    if (!fs.existsSync(filePath)) {
                        return {
                            isError: true,
                            content: [{ type: 'text', text: `File not found: ${filePath}` }],
                        };
                    }
                    
                    const stats = fs.statSync(filePath);
                    if (stats.isDirectory()) {
                        return {
                            isError: true,
                            content: [{ type: 'text', text: `Path is a directory, not a file: ${filePath}` }],
                        };
                    }
                    
                    // Limit file size to prevent memory issues (10MB max)
                    if (stats.size > 10 * 1024 * 1024) {
                        return {
                            isError: true,
                            content: [{ type: 'text', text: `File too large (max 10MB): ${filePath}` }],
                        };
                    }
                    
                    const content = fs.readFileSync(filePath, encoding);
                    return {
                        content: [{ type: 'text', text: content }],
                    };
                } catch (error) {
                    return {
                        isError: true,
                        content: [{ type: 'text', text: `Failed to read file: ${(error as Error).message}` }],
                    };
                }
            },
        },

        // ═══════════════════════════════════════════════════════════════════
        // Tool: write_file
        // Purpose: Write content to a file (create or overwrite)
        // ═══════════════════════════════════════════════════════════════════
        {
            name: 'write_file',
            description: `Write text content to a file. Creates the file if it does not exist.
By default, overwrites existing content. Use append=true to add to the end.
Automatically creates parent directories if they don't exist.
Supports path shortcuts: 'desktop', 'documents', 'downloads', 'home'.`,
            parameters: {
                type: 'object',
                properties: {
                    filePath: {
                        type: 'string',
                        description: 'Path to the file to write. Can be absolute or use shortcuts like "desktop/output.txt"',
                    },
                    content: {
                        type: 'string',
                        description: 'Text content to write to the file',
                    },
                    append: {
                        type: 'boolean',
                        description: 'If true, append to file instead of overwriting (default: false)',
                        default: false,
                    },
                },
                required: ['filePath', 'content'],
            },
            execute: async (
                args: Record<string, unknown>,
                _agentContext: AgentContext
            ): Promise<ToolResult> => {
                const filePath = resolvePath(args.filePath as string);
                const content = args.content as string;
                const append = args.append as boolean || false;
                
                console.log('[ElectronFileAgent] write_file:', filePath, 'append:', append);

                try {
                    // Ensure parent directory exists
                    const dir = path.dirname(filePath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    
                    if (append) {
                        fs.appendFileSync(filePath, content, 'utf-8');
                        return {
                            content: [{ type: 'text', text: `Successfully appended content to ${filePath}` }],
                        };
                    } else {
                        fs.writeFileSync(filePath, content, 'utf-8');
                        return {
                            content: [{ type: 'text', text: `Successfully wrote content to ${filePath}` }],
                        };
                    }
                } catch (error) {
                    return {
                        isError: true,
                        content: [{ type: 'text', text: `Failed to write file: ${(error as Error).message}` }],
                    };
                }
            },
        },

        // ═══════════════════════════════════════════════════════════════════
        // Tool: list_files
        // Purpose: List directory contents
        // ═══════════════════════════════════════════════════════════════════
        {
            name: 'list_files',
            description: `List all files and folders in a directory.
Returns file names with type indicators: [FILE] or [DIR].
Supports path shortcuts: 'desktop', 'documents', 'downloads', 'home'.
Use 'desktop' alone to list the desktop folder contents.`,
            parameters: {
                type: 'object',
                properties: {
                    directoryPath: {
                        type: 'string',
                        description: 'Path to the directory to list. Use shortcuts like "desktop" or "documents"',
                    },
                    showHidden: {
                        type: 'boolean',
                        description: 'If true, include hidden files (starting with dot)',
                        default: false,
                    },
                },
                required: ['directoryPath'],
            },
            execute: async (
                args: Record<string, unknown>,
                _agentContext: AgentContext
            ): Promise<ToolResult> => {
                const directoryPath = resolvePath(args.directoryPath as string);
                const showHidden = args.showHidden as boolean || false;
                
                console.log('[ElectronFileAgent] list_files:', directoryPath);

                try {
                    if (!fs.existsSync(directoryPath)) {
                        return {
                            isError: true,
                            content: [{ type: 'text', text: `Directory not found: ${directoryPath}` }],
                        };
                    }
                    
                    const stats = fs.statSync(directoryPath);
                    if (!stats.isDirectory()) {
                        return {
                            isError: true,
                            content: [{ type: 'text', text: `Path is not a directory: ${directoryPath}` }],
                        };
                    }
                    
                    const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
                    const fileList = entries
                        .filter(entry => showHidden || !entry.name.startsWith('.'))
                        .map(entry => {
                            const type = entry.isDirectory() ? '[DIR]' : '[FILE]';
                            return `${type} ${entry.name}`;
                        })
                        .sort();
                    
                    if (fileList.length === 0) {
                        return {
                            content: [{ type: 'text', text: `Directory is empty: ${directoryPath}` }],
                        };
                    }
                    
                    return {
                        content: [{ type: 'text', text: `Contents of ${directoryPath}:\n${fileList.join('\n')}` }],
                    };
                } catch (error) {
                    return {
                        isError: true,
                        content: [{ type: 'text', text: `Failed to list directory: ${(error as Error).message}` }],
                    };
                }
            },
        },

        // ═══════════════════════════════════════════════════════════════════
        // Tool: create_directory
        // Purpose: Create a directory
        // ═══════════════════════════════════════════════════════════════════
        {
            name: 'create_directory',
            description: `Create a directory at the specified path.
Automatically creates parent directories if they don't exist (recursive).
Returns success if directory already exists.
Supports path shortcuts: 'desktop', 'documents', 'downloads', 'home'.`,
            parameters: {
                type: 'object',
                properties: {
                    directoryPath: {
                        type: 'string',
                        description: 'Path to the directory to create. Can use shortcuts like "desktop/new_folder"',
                    },
                },
                required: ['directoryPath'],
            },
            execute: async (
                args: Record<string, unknown>,
                _agentContext: AgentContext
            ): Promise<ToolResult> => {
                const directoryPath = resolvePath(args.directoryPath as string);
                
                console.log('[ElectronFileAgent] create_directory:', directoryPath);

                try {
                    if (fs.existsSync(directoryPath)) {
                        const stats = fs.statSync(directoryPath);
                        if (stats.isDirectory()) {
                            return {
                                content: [{ type: 'text', text: `Directory already exists: ${directoryPath}` }],
                            };
                        } else {
                            return {
                                isError: true,
                                content: [{ type: 'text', text: `A file with that name already exists: ${directoryPath}` }],
                            };
                        }
                    }
                    
                    fs.mkdirSync(directoryPath, { recursive: true });
                    return {
                        content: [{ type: 'text', text: `Successfully created directory: ${directoryPath}` }],
                    };
                } catch (error) {
                    return {
                        isError: true,
                        content: [{ type: 'text', text: `Failed to create directory: ${(error as Error).message}` }],
                    };
                }
            },
        },

        // ═══════════════════════════════════════════════════════════════════
        // Tool: delete_file
        // Purpose: Delete a file
        // ═══════════════════════════════════════════════════════════════════
        {
            name: 'delete_file',
            description: `Delete a file from the local file system.
Does NOT delete directories - use with caution.
Returns success message if file was deleted, or error if file doesn't exist.
Supports path shortcuts: 'desktop', 'documents', 'downloads', 'home'.`,
            parameters: {
                type: 'object',
                properties: {
                    filePath: {
                        type: 'string',
                        description: 'Path to the file to delete',
                    },
                },
                required: ['filePath'],
            },
            execute: async (
                args: Record<string, unknown>,
                _agentContext: AgentContext
            ): Promise<ToolResult> => {
                const filePath = resolvePath(args.filePath as string);
                
                console.log('[ElectronFileAgent] delete_file:', filePath);

                try {
                    if (!fs.existsSync(filePath)) {
                        return {
                            isError: true,
                            content: [{ type: 'text', text: `File not found: ${filePath}` }],
                        };
                    }
                    
                    const stats = fs.statSync(filePath);
                    if (stats.isDirectory()) {
                        return {
                            isError: true,
                            content: [{ type: 'text', text: `Cannot delete directory with delete_file. Path: ${filePath}` }],
                        };
                    }
                    
                    fs.unlinkSync(filePath);
                    return {
                        content: [{ type: 'text', text: `Successfully deleted file: ${filePath}` }],
                    };
                } catch (error) {
                    return {
                        isError: true,
                        content: [{ type: 'text', text: `Failed to delete file: ${(error as Error).message}` }],
                    };
                }
            },
        },

        // ═══════════════════════════════════════════════════════════════════
        // Tool: move_file
        // Purpose: Move or rename a file
        // ═══════════════════════════════════════════════════════════════════
        {
            name: 'move_file',
            description: `Move or rename a file from one path to another.
Can be used to rename a file in the same directory or move to a different location.
Creates destination directory if it doesn't exist.
Supports path shortcuts: 'desktop', 'documents', 'downloads', 'home'.`,
            parameters: {
                type: 'object',
                properties: {
                    sourcePath: {
                        type: 'string',
                        description: 'Current path of the file to move',
                    },
                    destinationPath: {
                        type: 'string',
                        description: 'New path for the file (can be different directory or just new name)',
                    },
                },
                required: ['sourcePath', 'destinationPath'],
            },
            execute: async (
                args: Record<string, unknown>,
                _agentContext: AgentContext
            ): Promise<ToolResult> => {
                const sourcePath = resolvePath(args.sourcePath as string);
                const destinationPath = resolvePath(args.destinationPath as string);
                
                console.log('[ElectronFileAgent] move_file:', sourcePath, '->', destinationPath);

                try {
                    if (!fs.existsSync(sourcePath)) {
                        return {
                            isError: true,
                            content: [{ type: 'text', text: `Source file not found: ${sourcePath}` }],
                        };
                    }
                    
                    // Ensure destination directory exists
                    const destDir = path.dirname(destinationPath);
                    if (!fs.existsSync(destDir)) {
                        fs.mkdirSync(destDir, { recursive: true });
                    }
                    
                    fs.renameSync(sourcePath, destinationPath);
                    return {
                        content: [{ type: 'text', text: `Successfully moved ${sourcePath} to ${destinationPath}` }],
                    };
                } catch (error) {
                    return {
                        isError: true,
                        content: [{ type: 'text', text: `Failed to move file: ${(error as Error).message}` }],
                    };
                }
            },
        },

        // ═══════════════════════════════════════════════════════════════════
        // Tool: find_directory
        // Purpose: Find a directory by name (for use before creating files)
        // ═══════════════════════════════════════════════════════════════════
        {
            name: 'find_directory',
            description: `Find a directory/folder by name on the user's computer.
Searches common locations (desktop, documents, downloads, home) for a folder matching the name.
Use this when you need to find where a folder is located before creating or saving files there.
Returns the full path to the found directory, or an error if not found.
Example: find_directory with name "BMU" might return "C:/Users/.../Desktop/BMU"`,
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Name of the directory/folder to find (case-insensitive)',
                    },
                    searchIn: {
                        type: 'string',
                        description: 'Where to search: "all" (default), "desktop", "documents", "downloads", or "home"',
                        default: 'all',
                    },
                },
                required: ['name'],
            },
            execute: async (
                args: Record<string, unknown>,
                _agentContext: AgentContext
            ): Promise<ToolResult> => {
                const name = args.name as string;
                const searchIn = (args.searchIn as string) || 'all';
                
                console.log('[ElectronFileAgent] find_directory:', name, 'in:', searchIn);

                try {
                    const searchLocations: string[] = [];
                    
                    if (searchIn === 'all') {
                        searchLocations.push(
                            app.getPath('desktop'),
                            app.getPath('documents'),
                            app.getPath('downloads'),
                            app.getPath('home')
                        );
                    } else {
                        searchLocations.push(resolvePath(searchIn));
                    }
                    
                    const foundDirs: string[] = [];
                    const lowerName = name.toLowerCase();
                    
                    for (const location of searchLocations) {
                        // Check if the directory itself matches
                        if (path.basename(location).toLowerCase() === lowerName) {
                            foundDirs.push(location);
                        }
                        
                        // Search one level deep in each location
                        try {
                            const entries = fs.readdirSync(location, { withFileTypes: true });
                            for (const entry of entries) {
                                if (entry.isDirectory() && entry.name.toLowerCase() === lowerName) {
                                    foundDirs.push(path.join(location, entry.name));
                                }
                            }
                        } catch {
                            // Skip locations we can't access
                        }
                        
                        // Also search two levels deep for nested folders
                        try {
                            const entries = fs.readdirSync(location, { withFileTypes: true });
                            for (const entry of entries) {
                                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                                    const subPath = path.join(location, entry.name);
                                    try {
                                        const subEntries = fs.readdirSync(subPath, { withFileTypes: true });
                                        for (const subEntry of subEntries) {
                                            if (subEntry.isDirectory() && subEntry.name.toLowerCase() === lowerName) {
                                                foundDirs.push(path.join(subPath, subEntry.name));
                                            }
                                        }
                                    } catch {
                                        // Skip subdirectories we can't access
                                    }
                                }
                            }
                        } catch {
                            // Skip locations we can't access
                        }
                    }
                    
                    // Remove duplicates
                    const uniqueDirs = Array.from(new Set(foundDirs));
                    
                    if (uniqueDirs.length === 0) {
                        return {
                            isError: true,
                            content: [{ type: 'text', text: `No directory named "${name}" found in ${searchIn === 'all' ? 'common locations' : searchIn}` }],
                        };
                    }
                    
                    if (uniqueDirs.length === 1) {
                        return {
                            content: [{ type: 'text', text: `Found directory: ${uniqueDirs[0]}` }],
                        };
                    }
                    
                    return {
                        content: [{ type: 'text', text: `Found ${uniqueDirs.length} directories named "${name}":\n${uniqueDirs.join('\n')}` }],
                    };
                } catch (error) {
                    return {
                        isError: true,
                        content: [{ type: 'text', text: `Failed to find directory: ${(error as Error).message}` }],
                    };
                }
            },
        },

        // ═══════════════════════════════════════════════════════════════════
        // Tool: search_files
        // Purpose: Search for files by name
        // ═══════════════════════════════════════════════════════════════════
        {
            name: 'search_files',
            description: `Search for files in a directory whose names contain a keyword.
Searches recursively up to 3 levels deep (for performance).
Ignores hidden files/folders and node_modules.
Returns a list of matching file paths.
Supports path shortcuts: 'desktop', 'documents', 'downloads', 'home'.`,
            parameters: {
                type: 'object',
                properties: {
                    directoryPath: {
                        type: 'string',
                        description: 'Directory to search in. Use shortcuts like "desktop" or "documents"',
                    },
                    query: {
                        type: 'string',
                        description: 'Keyword to search for in file names (case-insensitive)',
                    },
                },
                required: ['directoryPath', 'query'],
            },
            execute: async (
                args: Record<string, unknown>,
                _agentContext: AgentContext
            ): Promise<ToolResult> => {
                const directoryPath = resolvePath(args.directoryPath as string);
                const query = args.query as string;
                
                console.log('[ElectronFileAgent] search_files:', directoryPath, 'query:', query);

                try {
                    if (!fs.existsSync(directoryPath)) {
                        return {
                            isError: true,
                            content: [{ type: 'text', text: `Directory not found: ${directoryPath}` }],
                        };
                    }
                    
                    const results = searchFilesRecursive(directoryPath, query);
                    
                    if (results.length === 0) {
                        return {
                            content: [{ type: 'text', text: `No files found matching "${query}" in ${directoryPath}` }],
                        };
                    }
                    
                    // Limit results to prevent huge responses
                    const maxResults = 50;
                    const displayResults = results.slice(0, maxResults);
                    const hasMore = results.length > maxResults;
                    
                    let resultText = `Found ${results.length} file(s) matching "${query}":\n${displayResults.join('\n')}`;
                    if (hasMore) {
                        resultText += `\n... and ${results.length - maxResults} more`;
                    }
                    
                    return {
                        content: [{ type: 'text', text: resultText }],
                    };
                } catch (error) {
                    return {
                        isError: true,
                        content: [{ type: 'text', text: `Failed to search files: ${(error as Error).message}` }],
                    };
                }
            },
        },

        // ═══════════════════════════════════════════════════════════════════
        // Tool: get_file_info
        // Purpose: Get metadata about a file (size, dates, type)
        // ═══════════════════════════════════════════════════════════════════
        {
            name: 'get_file_info',
            description: `Get information about a file including size, creation date, modification date, and type.
Useful for checking if a file exists and getting its properties before reading or modifying.
Supports path shortcuts: 'desktop', 'documents', 'downloads', 'home'.`,
            parameters: {
                type: 'object',
                properties: {
                    filePath: {
                        type: 'string',
                        description: 'Path to the file to get information about',
                    },
                },
                required: ['filePath'],
            },
            execute: async (
                args: Record<string, unknown>,
                _agentContext: AgentContext
            ): Promise<ToolResult> => {
                const filePath = resolvePath(args.filePath as string);
                
                console.log('[ElectronFileAgent] get_file_info:', filePath);

                try {
                    if (!fs.existsSync(filePath)) {
                        return {
                            isError: true,
                            content: [{ type: 'text', text: `File not found: ${filePath}` }],
                        };
                    }
                    
                    const stats = fs.statSync(filePath);
                    const type = stats.isDirectory() ? 'Directory' : 'File';
                    const size = stats.isFile() 
                        ? stats.size < 1024 
                            ? `${stats.size} bytes`
                            : stats.size < 1024 * 1024
                                ? `${(stats.size / 1024).toFixed(2)} KB`
                                : `${(stats.size / (1024 * 1024)).toFixed(2)} MB`
                        : 'N/A';
                    
                    const info = [
                        `Path: ${filePath}`,
                        `Type: ${type}`,
                        `Size: ${size}`,
                        `Created: ${stats.birthtime.toISOString()}`,
                        `Modified: ${stats.mtime.toISOString()}`,
                        `Extension: ${path.extname(filePath) || 'none'}`,
                    ].join('\n');
                    
                    return {
                        content: [{ type: 'text', text: info }],
                    };
                } catch (error) {
                    return {
                        isError: true,
                        content: [{ type: 'text', text: `Failed to get file info: ${(error as Error).message}` }],
                    };
                }
            },
        },
    ];
}

/**
 * Create the ElectronFileAgent
 * 
 * Per Eko documentation (docss/agents/custom-agent.md):
 * - Agents are created with new Agent({ name, description, tools })
 * - The description explains the agent's role and usage scenarios
 * - Tools are the core capability that execute actual operations
 */
export function createElectronFileAgent(): Agent {
    return new Agent({
        name: 'file',
        description: `You are a file system agent that handles local file operations.
You can read, write, list, create, delete, move, and search files on the user's computer.

When working with files:
1. Use path shortcuts for common locations: 'desktop', 'documents', 'downloads', 'home'
   Example: 'desktop/notes.txt' refers to a file on the user's desktop
2. Always check if a file exists before trying to read or delete it
3. When writing files, content is UTF-8 encoded by default
4. Use search_files to find files when you don't know the exact path
5. Use list_files to explore directory contents before operating on files

Common use cases:
- Save search results or summaries to a file
- Read content from existing files
- Organize files by moving or renaming them
- Create directories for organizing content`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: createFileTools() as any,
    });
}

/**
 * Export individual tool creation for testing or custom configurations
 */
export { createFileTools };
