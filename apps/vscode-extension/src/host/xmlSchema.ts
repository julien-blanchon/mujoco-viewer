import * as vscode from "vscode";
import * as path from "node:path";

interface XMLFileAssociation {
  systemId: string;
  pattern: string;
}

interface XMLExtensionApi {
  addXMLFileAssociations(associations: XMLFileAssociation[]): void;
  removeXMLFileAssociations(associations: XMLFileAssociation[]): void;
}

/**
 * Filename patterns we treat as MJCF for schema purposes. Either double
 * extension is a strong signal the file is a MuJoCo model — plain `*.xml`
 * is not (too many false positives), users who want schema help on a
 * plain `.xml` can add their own `xml.fileAssociations` entry.
 */
const SCHEMA_PATTERNS = ["**/*.mjcf.xml", "**/*.mujoco.xml"] as const;

let registered: {
  api: XMLExtensionApi;
  associations: XMLFileAssociation[];
} | null = null;

/**
 * Register the bundled MuJoCo XSD schema with the RedHat XML extension
 * so that *.mjcf.xml / *.mujoco.xml files get validation and autocomplete.
 * Idempotent.
 */
export async function registerXmlSchema(
  context: vscode.ExtensionContext,
): Promise<void> {
  if (registered) return;
  const xmlExt =
    vscode.extensions.getExtension<XMLExtensionApi>("redhat.vscode-xml");
  if (!xmlExt) return;

  if (!xmlExt.isActive) {
    await xmlExt.activate();
  }

  const xsdPath = path.join(context.extensionPath, "schemas", "mujoco.xsd");
  const associations: XMLFileAssociation[] = SCHEMA_PATTERNS.map((pattern) => ({
    systemId: xsdPath,
    pattern,
  }));

  xmlExt.exports.addXMLFileAssociations(associations);
  registered = { api: xmlExt.exports, associations };
}

export function unregisterXmlSchema(): void {
  if (!registered) return;
  try {
    registered.api.removeXMLFileAssociations(registered.associations);
  } catch {
    // RedHat XML occasionally throws on repeated remove; safe to ignore.
  }
  registered = null;
}
