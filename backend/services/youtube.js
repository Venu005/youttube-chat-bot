import { YoutubeLoader } from "@langchain/community/document_loaders/web/youtube";

export class YouTubeService {
  extractVideoId(url) {
    if (!url) return null;

    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /^([^&\n?#]{11})$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  async getTranscript(videoId) {
    try {
      console.log(`Fetching transcript for video ${videoId}...`);

      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const loader = YoutubeLoader.createFromUrl(videoUrl, {
        language: "en",
        addVideoInfo: true, // This will add title, description, etc.
      });

      const docs = await loader.load();

      if (!docs || docs.length === 0) {
        throw new Error("No transcript available");
      }

      // The transcript is in the pageContent field
      const transcript = docs[0].pageContent;

      if (!transcript || transcript.trim().length === 0) {
        throw new Error("Empty transcript received");
      }

      console.log("Transcript fetched successfully");
      return transcript;
    } catch (error) {
      console.error("Error fetching transcript:", error);

      if (error.message.includes("Subtitles are disabled for this video")) {
        throw new Error("No transcript available for this video");
      }

      throw new Error(
        error.message === "No transcript available"
          ? "No transcript found for this video"
          : "Failed to fetch video transcript"
      );
    }
  }

  // Optional: If you want to get video metadata as well
  async getVideoInfo(videoId) {
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const loader = YoutubeLoader.createFromUrl(videoUrl, {
        language: "en",
        addVideoInfo: true,
      });

      const docs = await loader.load();

      if (!docs || docs.length === 0) {
        throw new Error("Could not fetch video information");
      }

      // Return the metadata from the document
      return docs[0].metadata;
    } catch (error) {
      console.error("Error fetching video info:", error);
      throw new Error("Failed to fetch video information");
    }
  }
}
