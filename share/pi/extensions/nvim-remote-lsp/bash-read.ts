import * as os from "node:os";
import * as path from "node:path";

/**
 * Returns the absolute path of the file being read by a bash command that is
 * equivalent to a read tool call (cat, head, sed -n), or null if not recognized.
 * False negatives are acceptable; false positives are not.
 */
export function extractBashReadPath(
  command: string,
  sessionCwd: string,
): string | null {
  let effectiveCwd = sessionCwd;
  let cmd = command.trim();

  // Strip optional `cd /some/dir && ` or `cd /some/dir; ` prefix
  const cdMatch = cmd.match(/^cd\s+(\S+)\s*(?:&&|;)\s*([\s\S]+)/);
  if (cdMatch) {
    effectiveCwd = path.resolve(sessionCwd, cdMatch[1]);
    cmd = cdMatch[2].trim();
  }

  let filePath: string | undefined;

  // cat FILE
  const catMatch = cmd.match(/^cat\s+(\S+)\s*$/);
  if (catMatch) filePath = catMatch[1];

  // head FILE  |  head -N FILE  |  head -n N FILE
  if (!filePath) {
    const headMatch = cmd.match(/^head\s+(?:-\d+\s+|-n\s+\d+\s+)?(\S+)\s*$/);
    if (headMatch) filePath = headMatch[1];
  }

  // sed -n 'NUMp' FILE  |  sed -n 'NUM,NUMp' FILE  (single or double quotes)
  if (!filePath) {
    const sedMatch = cmd.match(
      /^sed\s+-n\s+['"][0-9]+(?:,[0-9]+)?p['"]\s+(\S+)\s*$/,
    );
    if (sedMatch) filePath = sedMatch[1];
  }

  if (!filePath) return null;

  // Expand leading ~
  if (filePath.startsWith("~/"))
    filePath = path.join(os.homedir(), filePath.slice(2));

  return path.resolve(effectiveCwd, filePath);
}
