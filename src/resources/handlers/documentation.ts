import { getDocumentationIndex } from "../../documentation/index.js";

export function listDocumentation(): Record<string, unknown> {
  const index = getDocumentationIndex();
  index.initialize();
  const sdkList = index.getSdkList();
  const sdkDocumentation = sdkList.map((sdk) => {
    const overview = index.getSdkOverview(sdk);
    return {
      sdk,
      name: overview?.name ?? sdk,
      sections: overview?.sections.length ?? 0,
      classes: overview?.classes.length ?? 0,
      chunks: overview?.total_chunks ?? 0,
      uri: `openfga://docs/${sdk}`,
    };
  });

  const guides = (["authoring", "general"] as const).map((type) => {
    const overview = index.getSdkOverview(type);
    if (!overview) return null;
    return {
      type,
      name: overview.name,
      sections: overview.sections.length,
      chunks: overview.total_chunks,
      uri: `openfga://docs/${type}`,
    };
  }).filter(Boolean);

  return {
    status: "✅ Documentation Index",
    sdk_documentation: sdkDocumentation,
    guides_documentation: guides,
    total_sdks: sdkList.length,
    endpoints: {
      "openfga://docs/{sdk}": "Get SDK or guide overview",
      "openfga://docs/search/{query}": "Search documentation",
    },
  };
}

export function getSdkDocumentation(sdk: string): Record<string, unknown> {
  const index = getDocumentationIndex();
  index.initialize();
  const overview = index.getSdkOverview(sdk);
  if (!overview) {
    return { status: "❌ Not Found", requested_sdk: sdk, available_sdks: index.getSdkList() };
  }
  const isGeneral = sdk === "general" || sdk === "authoring";
  return {
    status: isGeneral ? "✅ Documentation" : "✅ SDK Documentation",
    type: isGeneral ? "general" : "sdk",
    sdk,
    name: overview.name,
    source: overview.source,
    generated: overview.generated,
    sections: overview.sections,
    total_chunks: overview.total_chunks,
    classes: isGeneral ? undefined : overview.classes.length,
    endpoints: {
      [`openfga://docs/${sdk}/section/{section}`]: `Available sections: ${overview.sections.join(", ")}`,
      ...(isGeneral ? {} : { [`openfga://docs/${sdk}/class/{class}`]: `Available classes: ${overview.classes.join(", ")}` }),
    },
  };
}

export function getClassDocumentation(sdk: string, className: string): Record<string, unknown> {
  const index = getDocumentationIndex();
  index.initialize();
  const classDoc = index.getClassDocumentation(sdk, className);
  if (!classDoc) {
    const overview = index.getSdkOverview(sdk);
    return { status: "❌ Not Found", requested_class: className, sdk, available_classes: overview?.classes ?? [] };
  }
  return {
    status: "✅ Class Documentation",
    sdk,
    content: classDoc.content,
    metadata: {
      class: className,
      sdk,
      namespace: classDoc.namespace,
      methods: Object.keys(classDoc.methods),
      method_count: Object.keys(classDoc.methods).length,
    },
  };
}

export function getMethodDocumentation(sdk: string, className: string, methodName: string): Record<string, unknown> {
  const index = getDocumentationIndex();
  index.initialize();
  const methodDoc = index.getMethodDocumentation(sdk, className, methodName);
  if (!methodDoc) {
    const classDoc = index.getClassDocumentation(sdk, className);
    return {
      status: "❌ Not Found",
      requested_method: methodName,
      class: className,
      sdk,
      available_methods: classDoc ? Object.keys(classDoc.methods) : [],
    };
  }
  return {
    status: "✅ Method Documentation",
    sdk,
    content: methodDoc.content,
    metadata: {
      method: methodName,
      class: className,
      sdk,
      signature: methodDoc.signature,
      parameters: methodDoc.parameters,
      returns: methodDoc.returns,
    },
  };
}

export function getDocumentationSection(sdk: string, sectionName: string): Record<string, unknown> {
  const index = getDocumentationIndex();
  index.initialize();
  const chunks = index.getChunksBySection(sdk, sectionName);
  if (chunks.length === 0) {
    const overview = index.getSdkOverview(sdk);
    return { status: "❌ Not Found", requested_section: sectionName, sdk, available_sections: overview?.sections ?? [] };
  }
  const content = chunks.map((c) => c.content).join("\n\n---\n\n");
  return {
    status: "✅ Section Documentation",
    sdk,
    content,
    metadata: {
      section: sectionName,
      sdk,
      chunk_count: chunks.length,
      total_size: content.length,
    },
  };
}

export function getDocumentationChunk(sdk: string, chunkId: string): Record<string, unknown> {
  const index = getDocumentationIndex();
  index.initialize();
  const chunk = index.getChunk(chunkId);
  if (!chunk || chunk.sdk !== sdk) {
    return { status: "❌ Not Found", requested_chunk: chunkId, sdk, note: "Chunk not found in documentation index" };
  }

  const navigation: Record<string, string> = {};
  if (chunk.prev_chunk) navigation.previous = chunk.prev_chunk;
  if (chunk.next_chunk) navigation.next = chunk.next_chunk;

  return {
    status: `✅ Documentation Chunk: ${chunkId}`,
    sdk,
    content: chunk.content,
    metadata: { ...chunk.metadata, chunk_id: chunkId, sdk },
    navigation,
  };
}

export function searchDocumentation(query: string): Record<string, unknown> {
  const index = getDocumentationIndex();
  index.initialize();
  const results = index.searchChunks(query, null, 20);
  if (results.length === 0) {
    return { status: "❌ No Results", query, available_sdks: index.getSdkList() };
  }
  return {
    status: "✅ Search Results",
    query,
    total_results: results.length,
    results: results.map((r) => ({
      chunk_id: r.chunk_id,
      sdk: r.sdk,
      score: r.score,
      preview: r.preview,
      metadata: r.metadata,
      uri: `openfga://docs/${r.sdk}/chunk/${r.chunk_id}`,
    })),
  };
}
