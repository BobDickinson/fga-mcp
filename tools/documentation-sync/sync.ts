#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type SourceConfig = {
  repo: string;
  branch: string;
  paths: string[];
  recursive: boolean;
  output: string;
};

type GitHubContentItem = {
  name: string;
  path: string;
  type: "file" | "dir";
};

const USER_AGENT = "OpenFGA-MCP-Documentation-Sync/1.0";
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com";

const SOURCE_MAPPING: Record<string, SourceConfig> = {
  OPENFGA_DOCS: {
    repo: "openfga/openfga.dev",
    branch: "main",
    paths: ["docs/content"],
    recursive: true,
    output: "OPENFGA_DOCS.md",
  },
  PYTHON_SDK: {
    repo: "openfga/python-sdk",
    branch: "main",
    paths: ["README.md"],
    recursive: false,
    output: "PYTHON_SDK.md",
  },
  JAVA_SDK: {
    repo: "openfga/java-sdk",
    branch: "main",
    paths: ["README.md"],
    recursive: false,
    output: "JAVA_SDK.md",
  },
  JS_SDK: {
    repo: "openfga/js-sdk",
    branch: "main",
    paths: ["README.md"],
    recursive: false,
    output: "JS_SDK.md",
  },
  DOTNET_SDK: {
    repo: "openfga/dotnet-sdk",
    branch: "main",
    paths: ["README.md"],
    recursive: false,
    output: "DOTNET_SDK.md",
  },
  GO_SDK: {
    repo: "openfga/go-sdk",
    branch: "main",
    paths: ["README.md"],
    recursive: false,
    output: "GO_SDK.md",
  },
  PHP_SDK: {
    repo: "evansims/openfga-php",
    branch: "main",
    paths: ["README.md", "docs"],
    recursive: true,
    output: "PHP_SDK.md",
  },
  LARAVEL_SDK: {
    repo: "evansims/openfga-laravel",
    branch: "main",
    paths: ["README.md", "docs"],
    recursive: true,
    output: "LARAVEL_SDK.md",
  },
};

class DocumentationSync {
  constructor(
    private readonly outputDir: string,
    private readonly githubToken = "",
    private readonly verbose = false,
  ) {
    mkdirSync(this.outputDir, { recursive: true });
  }

  async sync(sources?: string[]): Promise<void> {
    const selectedSources = sources ?? Object.keys(SOURCE_MAPPING);

    for (const source of selectedSources) {
      const config = SOURCE_MAPPING[source];
      if (!config) {
        this.log(`Unknown source: ${source}`, true);
        continue;
      }

      this.log(`Syncing ${source}...`);
      try {
        await this.syncSource(source, config);
        this.log(`${source} synced successfully`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`Failed to sync ${source}: ${message}`, true);
      }
    }
  }

  private async syncSource(name: string, config: SourceConfig): Promise<void> {
    const outputPath = join(this.outputDir, config.output);
    let compiledContent = this.compileHeader(name, config.repo);

    for (const path of config.paths) {
      this.log(`  Fetching ${path}...`);
      const content =
        config.recursive && !path.endsWith(".md") && !path.endsWith(".mdx")
          ? await this.fetchDirectoryContent(config.repo, config.branch, path)
          : await this.fetchFileContent(config.repo, config.branch, path);

      if (content !== "") {
        compiledContent += content;
      }
    }

    writeFileSync(outputPath, compiledContent, "utf8");
    this.log(`  Saved to ${outputPath}`);
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "application/vnd.github.v3+json",
    };
    if (this.githubToken !== "") {
      headers.Authorization = `Bearer ${this.githubToken}`;
    }
    return headers;
  }

  private async fetchFileContent(repo: string, branch: string, path: string): Promise<string> {
    try {
      const url = `${GITHUB_RAW_BASE}/${repo}/${branch}/${path}`;
      const response = await fetch(url, { headers: this.headers() });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const content = await response.text();
      return this.processMarkdownContent(content, repo, path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`    Failed to fetch ${path}: ${message}`);
      return "";
    }
  }

  private async fetchDirectoryContent(repo: string, branch: string, path: string): Promise<string> {
    try {
      const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
      const response = await fetch(url, { headers: this.headers() });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const items = (await response.json()) as GitHubContentItem[] | GitHubContentItem;
      const entries = Array.isArray(items) ? items : [items];
      let compiledContent = "";

      entries.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "dir" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      for (const item of entries) {
        if (item.type === "file" && (item.name.endsWith(".md") || item.name.endsWith(".mdx"))) {
          this.log(`    Processing ${item.path}`);
          compiledContent += await this.fetchFileContent(repo, branch, item.path);
        } else if (item.type === "dir") {
          this.log(`    Entering ${item.path}`);
          compiledContent += await this.fetchDirectoryContent(repo, branch, item.path);
        }
      }

      return compiledContent;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`    Failed to fetch directory ${path}: ${message}`);
      return "";
    }
  }

  private processMarkdownContent(content: string, repo: string, path: string): string {
    let processed = `\n\n<!-- Source: ${repo}/${path} -->\n\n`;
    const lines = content.split("\n");
    let inCodeBlock = false;

    for (const line of lines) {
      if (line.startsWith("```")) {
        inCodeBlock = !inCodeBlock;
      }

      processed += `${inCodeBlock ? line : this.adjustHeadingLevel(this.fixImageUrls(this.fixRelativeLinks(line, repo), repo), path)}\n`;
    }

    processed += `\n\n<!-- End of ${repo}/${path} -->\n`;
    return processed;
  }

  private adjustHeadingLevel(line: string, path: string): string {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) {
      return line;
    }

    let level = match[1].length;
    level = path.includes("README") ? Math.min(level + 1, 6) : Math.min(level + 2, 6);
    return `${"#".repeat(level)} ${match[2]}`;
  }

  private fixRelativeLinks(line: string, repo: string): string {
    return line.replace(/\[([^\]]+)\]\((?!https?:\/\/)([^)]+)\)/g, (_match, text: string, url: string) => {
      if (url.startsWith("#")) {
        return `[${text}](${url})`;
      }
      return `[${text}](https://github.com/${repo}/blob/main/${url})`;
    });
  }

  private fixImageUrls(line: string, repo: string): string {
    return line.replace(/!\[([^\]]*)\]\((?!https?:\/\/)([^)]+)\)/g, (_match, alt: string, path: string) => {
      return `![${alt}](https://raw.githubusercontent.com/${repo}/main/${path})`;
    });
  }

  private compileHeader(name: string, repo: string): string {
    return [
      `# ${name} Documentation`,
      "",
      `> Compiled from: https://github.com/${repo}`,
      `> Generated: ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`,
      "",
      "---",
    ].join("\n");
  }

  private log(message: string, isError = false): void {
    if (this.verbose || isError) {
      process.stdout.write(`${message}\n`);
    }
  }
}

function showHelp(): void {
  process.stdout.write(`OpenFGA Documentation Sync Tool

Usage: npm run docs:sync -- [OPTIONS]

Options:
  -o, --output <dir>     Output directory for compiled documentation (default: docs)
  -t, --token <token>    GitHub personal access token (optional, uses GITHUB_TOKEN env if not provided)
  -s, --source <sources> Comma-separated list of sources to sync (default: all)
  -v, --verbose         Enable verbose output
  -h, --help           Show this help message
`);
}

function parseArgs(argv: string[]): {
  outputDir: string;
  githubToken: string;
  verbose: boolean;
  sources?: string[];
  help: boolean;
} {
  const defaultOutput = join(dirname(fileURLToPath(import.meta.url)), "../../docs");
  let outputDir = defaultOutput;
  let githubToken = process.env.GITHUB_TOKEN ?? "";
  let verbose = false;
  let sources: string[] | undefined;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        help = true;
        break;
      case "-v":
      case "--verbose":
        verbose = true;
        break;
      case "-o":
      case "--output":
        outputDir = argv[++i] ?? outputDir;
        break;
      case "-t":
      case "--token":
        githubToken = argv[++i] ?? githubToken;
        break;
      case "-s":
      case "--source":
        sources = (argv[++i] ?? "").split(",").filter(Boolean);
        break;
      default:
        break;
    }
  }

  return { outputDir, githubToken, verbose, sources, help };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    showHelp();
    return;
  }

  const sync = new DocumentationSync(args.outputDir, args.githubToken, args.verbose);
  await sync.sync(args.sources);
  process.stdout.write("Documentation sync completed successfully!\n");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
});
