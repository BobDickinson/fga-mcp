import type { OpenFgaClient } from "@openfga/sdk";
import type { ResourceTarget } from "../../src/resource-resolver.js";

export function targetFrom(client: Partial<OpenFgaClient>, serverRef = "default"): ResourceTarget {
  return {
    client: client as OpenFgaClient,
    serverRef,
    policy: { restrict: false, writeable: true },
    dynamic: false,
  };
}
