// Background service worker for Chrome extension
console.log("YouTube Chatbot background script loaded");

// Configuration
const CONFIG = {
  API_BASE_URL: "http://localhost:3000/api/chatbot",
  // For development, use: '' https://your-backend-url.onrender.com/api/chatbot
};

class YouTubeChatbotBackground {
  constructor() {
    this.setupEventListeners();
    this.currentVideoData = null;
  }

  setupEventListeners() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      console.log("Extension installed:", details.reason);

      if (details.reason === "install") {
        // Show welcome page or setup instructions
        chrome.tabs.create({
          url: "popup/popup.html",
        });
      }
    });

    // Handle messages from content script and popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Handle tab updates (when user navigates)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (
        changeInfo.status === "complete" &&
        tab.url?.includes("youtube.com/watch")
      ) {
        console.log("YouTube video page loaded:", tab.url);
      }
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.type) {
        case "VIDEO_CHANGED":
          await this.handleVideoChanged(request);
          sendResponse({ success: true });
          break;

        case "PROCESS_VIDEO":
          const processResult = await this.processVideo(request.videoId);
          sendResponse(processResult);
          break;

        case "SEND_CHAT_MESSAGE":
          const chatResult = await this.sendChatMessage(
            request.videoId,
            request.message
          );
          sendResponse(chatResult);
          break;

        case "CHECK_VIDEO_STATUS":
          const statusResult = await this.checkVideoStatus(request.videoId);
          sendResponse(statusResult);
          break;

        case "OPEN_CHAT":
          await this.openChatWindow(request);
          sendResponse({ success: true });
          break;

        case "GET_CURRENT_VIDEO":
          sendResponse({
            success: true,
            videoData: this.currentVideoData,
          });
          break;

        default:
          sendResponse({ success: false, error: "Unknown message type" });
      }
    } catch (error) {
      console.error("Error handling message:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleVideoChanged(data) {
    this.currentVideoData = {
      videoId: data.videoId,
      metadata: data.metadata,
      timestamp: Date.now(),
    };

    console.log("Video changed:", this.currentVideoData);

    // Store in Chrome storage
    await chrome.storage.local.set({
      currentVideo: this.currentVideoData,
    });
  }

  async processVideo(videoId) {
    try {
      console.log("Processing video:", videoId);

      const response = await fetch(`${CONFIG.API_BASE_URL}/process-video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ videoId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to process video");
      }

      console.log("Video processed successfully:", result);

      // Store processing status
      await chrome.storage.local.set({
        [`processed_${videoId}`]: {
          status: "completed",
          timestamp: Date.now(),
          chunksCount: result.chunksCount,
        },
      });

      return {
        success: true,
        message: "Video processed successfully",
        data: result,
      };
    } catch (error) {
      console.error("Error processing video:", error);

      await chrome.storage.local.set({
        [`processed_${videoId}`]: {
          status: "failed",
          timestamp: Date.now(),
          error: error.message,
        },
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  async sendChatMessage(videoId, message) {
    try {
      console.log("Sending chat message:", { videoId, message });

      const response = await fetch(`${CONFIG.API_BASE_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoId,
          question: message,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to send message");
      }

      console.log("Chat response received:", result);

      // Store chat history
      const chatHistory = await this.getChatHistory(videoId);
      chatHistory.push(
        {
          type: "user",
          message,
          timestamp: Date.now(),
        },
        {
          type: "assistant",
          message: result.response,
          timestamp: Date.now(),
          sources: result.sources,
        }
      );

      await this.saveChatHistory(videoId, chatHistory);

      return {
        success: true,
        response: result.response,
        sources: result.sources,
      };
    } catch (error) {
      console.error("Error sending chat message:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async checkVideoStatus(videoId) {
    try {
      const response = await fetch(
        `${CONFIG.API_BASE_URL}/video-status/${videoId}`
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to check video status");
      }

      return {
        success: true,
        processed: result.processed,
      };
    } catch (error) {
      console.error("Error checking video status:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async openChatWindow(data) {
    // For now, just focus on the popup
    // In the future, this could open a side panel or dedicated chat window
    console.log("Opening chat for video:", data.videoId);

    // Store the chat request
    await chrome.storage.local.set({
      chatRequest: {
        videoId: data.videoId,
        metadata: data.metadata,
        timestamp: Date.now(),
      },
    });
  }

  async getChatHistory(videoId) {
    try {
      const result = await chrome.storage.local.get(`chat_${videoId}`);
      return result[`chat_${videoId}`] || [];
    } catch (error) {
      console.error("Error getting chat history:", error);
      return [];
    }
  }

  async saveChatHistory(videoId, history) {
    try {
      await chrome.storage.local.set({
        [`chat_${videoId}`]: history,
      });
    } catch (error) {
      console.error("Error saving chat history:", error);
    }
  }

  async clearChatHistory(videoId) {
    try {
      await chrome.storage.local.remove(`chat_${videoId}`);
    } catch (error) {
      console.error("Error clearing chat history:", error);
    }
  }
}

// Initialize the background script
new YouTubeChatbotBackground();
