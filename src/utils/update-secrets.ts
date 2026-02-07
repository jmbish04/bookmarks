/**
 * Interface defining the expected Environment variables.
 * Add this to your worker-configuration.d.ts if not already present.
 */
export interface Env {
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_WORKER_EDIT_ADMIN_TOKEN: string;
  [key: string]: unknown; // Allow for other bindings
}

interface CloudflareResponse {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
  result: {
    name: string;
    type: string;
    modified_on?: string;
  } | null;
}

/**
 * Creates or updates a secret for the 'bookmarks' Worker using the provided Env.
 *
 * @param env - The Cloudflare Worker Env object containing credentials
 * @param secretName - The name of the secret (key) to create or update
 * @param secretValue - The value of the secret
 */
export async function updateBookmarksSecret(
  env: Env,
  secretName: string,
  secretValue: string
): Promise<CloudflareResponse['result']> {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_WORKER_EDIT_ADMIN_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      "Missing required environment variables: CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_WORKER_EDIT_ADMIN_TOKEN"
    );
  }

  // Hardcoded 'bookmarks' script name
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/bookmarks/secrets`;

  const payload = {
    name: secretName,
    text: secretValue,
    type: "secret_text",
  };

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data: CloudflareResponse = await response.json();

    if (!data.success) {
      const errorMessages = data.errors.map((e) => e.message).join(", ");
      throw new Error(`Failed to update secret '${secretName}' for 'bookmarks': ${errorMessages}`);
    }

    return data.result;
  } catch (error) {
    throw error;
  }
}