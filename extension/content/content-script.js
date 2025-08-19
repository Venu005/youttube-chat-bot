// Content script that runs on YouTube pages
console.log("YouTube Chatbot content script loaded");

class YouTubeChatbotContentScript {
  constructor() {
    this.currentVideoId = null;
    this.lastKnownVideoId = null;
    this.chatButton = null;
    this.init();
  }

  init() {
    // Wait for page to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    // Monitor for video changes
    this.observeVideoChanges();

    // Add chat button to YouTube interface
    this.addChatButton();

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async response
    });
  }

  /**
   * Extract video ID from current YouTube page
   */
  extractVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get("v");

    if (!videoId) {
      // Try alternative methods for different YouTube URL formats
      const pathname = window.location.pathname;
      const match = pathname.match(/\/watch\/([^/?]+)/);
      return match ? match[1] : null;
    }

    return videoId;
  }

  /**
   * Get video metadata
   */
  getVideoMetadata() {
    try {
      const titleElement = document.querySelector(
        "h1.ytd-watch-metadata yt-formatted-string"
      );
      const channelElement = document.querySelector("#owner #channel-name a");
      const viewsElement = document.querySelector("#info .view-count");

      return {
        title: titleElement?.textContent?.trim() || "Unknown Title",
        channel: channelElement?.textContent?.trim() || "Unknown Channel",
        views: viewsElement?.textContent?.trim() || "Unknown Views",
        url: window.location.href,
      };
    } catch (error) {
      console.error("Error extracting video metadata:", error);
      return {
        title: "Unknown Title",
        channel: "Unknown Channel",
        views: "Unknown Views",
        url: window.location.href,
      };
    }
  }

  /**
   * Observe video changes on YouTube
   */
  observeVideoChanges() {
    // YouTube is a SPA, so we need to watch for URL changes
    let lastUrl = location.href;

    const observer = new MutationObserver(() => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        this.onVideoChange();
      }
    });

    observer.observe(document, { subtree: true, childList: true });

    // Also check immediately
    this.onVideoChange();
  }

  /**
   * Handle video change
   */
  onVideoChange() {
    const newVideoId = this.extractVideoId();

    if (newVideoId && newVideoId !== this.lastKnownVideoId) {
      this.lastKnownVideoId = newVideoId;
      this.currentVideoId = newVideoId;

      console.log("Video changed to:", newVideoId);

      // Notify background script
      chrome.runtime.sendMessage({
        type: "VIDEO_CHANGED",
        videoId: newVideoId,
        metadata: this.getVideoMetadata(),
      });

      // Update chat button
      this.updateChatButton();
    }
  }

  /**
   * Add chat button to YouTube interface
   */
  addChatButton() {
    // Remove existing button if any
    if (this.chatButton) {
      this.chatButton.remove();
    }

    // Wait for YouTube's UI to load
    const checkForUI = () => {
      const actionsContainer = document.querySelector("#actions-inner");

      if (actionsContainer) {
        this.createChatButton(actionsContainer);
      } else {
        setTimeout(checkForUI, 1000);
      }
    };

    checkForUI();
  }

  openChatPopup() {
    if (!this.currentVideoId) {
      alert(
        "No video detected. Please make sure you are on a YouTube video page."
      );
      return;
    }

    // Get the current window dimensions
    const width = 400;
    const height = 600;
    const left = window.screen.width - width;
    const top = 0;

    // Open the popup window
    chrome.runtime.sendMessage({
      type: "OPEN_CHAT",
      videoId: this.currentVideoId,
      metadata: this.getVideoMetadata(),
    });

    window.open(
      chrome.runtime.getURL("popup/popup.html"),
      "youtube_chatbot_popup",
      `width=${width},height=${height},left=${left},top=${top},popup=true`
    );
  }
  updateChatButton() {
    if (this.chatButton && this.currentVideoId) {
      this.chatButton.style.display = "flex";
    } else if (this.chatButton) {
      this.chatButton.style.display = "none";
    }
  }

  /**
   * Open chat popup/sidebar
   */
  openChatPopup() {
    if (!this.currentVideoId) {
      alert(
        "No video detected. Please make sure you are on a YouTube video page."
      );
      return;
    }

    // Send message to open popup
    chrome.runtime.sendMessage({
      type: "OPEN_CHAT",
      videoId: this.currentVideoId,
      metadata: this.getVideoMetadata(),
    });
  }

  /**
   * Handle messages from popup or background
   */
  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.type) {
        case "GET_CURRENT_VIDEO":
          sendResponse({
            success: true,
            videoId: this.currentVideoId,
            metadata: this.getVideoMetadata(),
          });
          break;

        case "CHECK_VIDEO_STATUS":
          const isOnVideoPage = !!this.currentVideoId;
          sendResponse({
            success: true,
            isOnVideoPage,
            videoId: this.currentVideoId,
            metadata: isOnVideoPage ? this.getVideoMetadata() : null,
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

  /**
   * Check if current page is a video page
   */
  isVideoPage() {
    return window.location.pathname === "/watch" && !!this.extractVideoId();
  }
}

// Initialize the content script
new YouTubeChatbotContentScript();
