import { Logger } from "./logger";

const CF_IMAGES_API = "https://api.cloudflare.com/client/v4/accounts";

/**
 * Upload an image buffer to Cloudflare Images.
 * @returns The public URL of the uploaded image.
 */
export async function uploadToCloudflareImages(env: Env, imageBuffer: ArrayBuffer, id: string): Promise<string | null> {
    const logger = new Logger(env, "ImagesService");
    
    // 1. Check for Token and Binding
    const token = env.CLOUDFLARE_IMAGES_TOKEN;
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const imagesBinding = env.IMAGES;

    if (!token) {
        await logger.warn("Skipping image upload: CLOUDFLARE_IMAGES_TOKEN not configured.");
        return null;
    }

    if (!accountId) {
        await logger.warn("Skipping image upload: CLOUDFLARE_ACCOUNT_ID not configured.");
        return null; 
    }

    let uploadBuffer = imageBuffer;
    let extension = "png";
    let mimeType = "image/png";

    // 2. Upload Original PNG (Matching Python Script success)
    // Optimization block removed to ensure reliability and match user preference for PNG capture.
    
    // Default values (already set above, but reiterated for clarity)
    uploadBuffer = imageBuffer;
    extension = "png";
    mimeType = "image/png";
    
    await logger.info(`Uploading raw screenshot (${uploadBuffer.byteLength} bytes) to Cloudflare Images...`);

    try {
        const formData = new FormData();
        // Use File object as per Cloudflare Docs
        const file = new File([uploadBuffer], `${id}.${extension}`, { type: mimeType });
        formData.append("file", file);
        formData.append("id", id); // Optional: Custom ID

        // Log masking first 4 chars of token for debug
        // await logger.info(`Uploading to Cloudflare Images (Account: ${accountId}, Token: ${token.substring(0, 4)}...)`);

        const response = await fetch(`${CF_IMAGES_API}/${accountId}/images/v1`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Upload failed (${response.status}): ${errText}`);
        }

        const result: any = await response.json();
        
        if (!result.success) {
             throw new Error(`Upload API returned error: ${JSON.stringify(result.errors)}`);
        }

        // Return the first variant (usually 'public' or default)
        // result.result.variants is array of strings
        const variants = result.result.variants;
        if (variants && variants.length > 0) {
            return variants[0];
        }
        
        // Fallback if no variants returned (rare)
        return null;

    } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        await logger.error(`Failed to upload screenshot for ${id}`, { error: msg });
        return null;
    }
}
