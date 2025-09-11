import { json, type LoaderFunction } from '@remix-run/cloudflare';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export const loader: LoaderFunction = async ({ params }) => {
  try {
    const storageKey = params.storageKey;
    const bucketName = 'snapshot-files';

    if (!storageKey) {
      return json({ error: 'Storage key is required' }, { status: 400 });
    }

    const { data, error } = await supabase.storage.from(bucketName).download(storageKey);

    if (error) {
      console.error('Failed to download file:', error);
      return json({ error: 'File not found' }, { status: 404 });
    }

    // Return the file as a Response
    return new Response(data, {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      },
    });
  } catch (error) {
    console.error('Error downloading snapshot file:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
