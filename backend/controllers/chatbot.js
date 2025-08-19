import express from "express";
import { YouTubeService } from "../services/youtube.js";
import { VectorStoreService } from "../services/vectorStore.js";
import { LangChainService } from "../services/langchain.js";

const router = express.Router();


const youtubeService = new YouTubeService();
const vectorStoreService = new VectorStoreService();
const langchainService = new LangChainService();



router.post("/process-video", async (req, res) => {
  try {
    const { videoId, videoUrl } = req.body;

    if (!videoId && !videoUrl) {
      return res.status(400).json({
        error: "Video ID or URL is required",
      });
    }

    console.log(`Processing video: ${videoId || videoUrl}`);

    
    const extractedVideoId = videoId || youtubeService.extractVideoId(videoUrl);

    if (!extractedVideoId) {
      return res.status(400).json({
        error: "Invalid YouTube URL or video ID",
      });
    }

    // Get transcript and video info
    let transcript, videoInfo;
    try {
      [transcript, videoInfo] = await Promise.all([
        youtubeService.getTranscript(extractedVideoId),
        youtubeService.getVideoInfo(extractedVideoId),
      ]);

      console.log("Transcript and video info fetched successfully");
    } catch (error) {
      console.error("Transcript error:", error);
      return res.status(404).json({
        error: error.message,
        details:
          process.env.NODE_ENV !== "production" ? error.stack : undefined,
      });
    }

    console.log("Processing transcript chunks...");
    const chunks = await langchainService.splitText(transcript);

    if (!chunks || chunks.length === 0) {
      return res.status(500).json({
        error: "Failed to process transcript chunks",
      });
    }

    // Create or update vector store
    console.log(`Creating vector store for ${chunks.length} chunks...`);
    await vectorStoreService.createVectorStore(chunks, extractedVideoId);

    res.status(200).json({
      success: true,
      message: "Video processed successfully",
      videoId: extractedVideoId,
      chunksCount: chunks.length,
      videoInfo: videoInfo,
    });
  } catch (error) {
    console.error("Error processing video:", error);
    res.status(500).json({
      error: error.message || "Failed to process video",
      details: process.env.NODE_ENV !== "production" ? error.stack : undefined,
    });
  }
});

router.post("/chat", async (req, res) => {
  try {
    const { videoId, question, conversationId } = req.body;

    if (!videoId || !question) {
      return res.status(400).json({
        error: "Video ID and question are required",
      });
    }

    console.log(`Chat request for video ${videoId}: ${question}`);

    // Check if vector store exists for this video
    const vectorStoreExists = await vectorStoreService.vectorStoreExists(
      videoId
    );

    if (!vectorStoreExists) {
      return res.status(404).json({
        error: "Video not processed yet. Please process the video first.",
      });
    }

    // Retrieve relevant documents
    const relevantDocs = await vectorStoreService.similaritySearch(
      videoId,
      question,
      3
    );

    // Generate response using LangChain
    const response = await langchainService.generateResponse(
      question,
      relevantDocs
    );

    res.status(200).json({
      success: true,
      response,
      sources: relevantDocs.length,
      conversationId: conversationId || `conv_${Date.now()}`,
    });
  } catch (error) {
    console.error("Error in chat:", error);
    res.status(500).json({
      error: "Failed to generate response",
      details:
        process.env.NODE_ENV !== "production" ? error.message : undefined,
    });
  }
});


router.get("/video-status/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;

    const isProcessed = await vectorStoreService.vectorStoreExists(videoId);

    res.status(200).json({
      videoId,
      processed: isProcessed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error checking video status:", error);
    res.status(500).json({
      error: "Failed to check video status",
      details:
        process.env.NODE_ENV !== "production" ? error.message : undefined,
    });
  }
});


router.delete("/video/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;

    await vectorStoreService.deleteVectorStore(videoId);

    res.status(200).json({
      success: true,
      message: `Video data for ${videoId} deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting video data:", error);
    res.status(500).json({
      error: "Failed to delete video data",
      details:
        process.env.NODE_ENV !== "production" ? error.message : undefined,
    });
  }
});

export default router;
