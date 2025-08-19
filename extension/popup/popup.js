import { APIService } from "../services/api-service.js";

class ChatbotPopup {
  constructor() {
    this.api = new APIService();
    this.videoId = null;
    this.metadata = null;
    this.conversationId = null;
    this.isProcessing = false;

    this.init();
  }

  async init() {
    this.setupElements();
    this.setupEventListeners();
    await this.getCurrentVideo();
  }

  setupElements() {
    this.titleElement = document.getElementById("video-title");
    this.channelElement = document.getElementById("channel-name");
    this.messagesContainer = document.getElementById("messages");
    this.questionInput = document.getElementById("question-input");
    this.sendButton = document.getElementById("send-button");
    this.loadingElement = document.getElementById("loading");
    this.statusMessage = document.getElementById("status-message");
  }

  setupEventListeners() {
    this.sendButton.addEventListener("click", () => this.sendQuestion());
    this.questionInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendQuestion();
      }
    });
  }

  async getCurrentVideo() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "GET_CURRENT_VIDEO",
      });

      if (response.success && response.videoId) {
        this.videoId = response.videoId;
        this.metadata = response.metadata;
        this.updateUI();
        this.checkVideoStatus();
      } else {
        this.showError("No video detected");
      }
    } catch (error) {
      console.error("Error getting current video:", error);
      this.showError("Failed to connect to YouTube page");
    }
  }

  updateUI() {
    if (this.metadata) {
      this.titleElement.textContent = this.metadata.title;
      this.channelElement.textContent = this.metadata.channel;
    }
  }

  async checkVideoStatus() {
    try {
      const status = await this.api.checkVideoStatus(this.videoId);

      if (!status.processed) {
        this.showLoading("Processing video...");
        await this.processVideo();
      } else {
        this.hideLoading();
        this.enableChat();
      }
    } catch (error) {
      console.error("Error checking video status:", error);
      this.showError("Failed to check video status");
    }
  }

  async processVideo() {
    try {
      this.isProcessing = true;
      this.showLoading("Processing video transcript...");

      const result = await this.api.processVideo(this.videoId, this.metadata);

      if (result.success) {
        this.hideLoading();
        this.enableChat();
        this.addMessage(
          "Video processed successfully! You can now ask questions about it.",
          "bot"
        );
      } else {
        throw new Error(result.error || "Failed to process video");
      }
    } catch (error) {
      console.error("Error processing video:", error);
      this.hideLoading();
      this.showError(error.message || "Failed to process video transcript");

      // Add retry button
      const retryButton = document.createElement("button");
      retryButton.textContent = "Retry Processing";
      retryButton.classList.add("retry-button");
      retryButton.onclick = () => this.processVideo();
      this.messagesContainer.appendChild(retryButton);
    } finally {
      this.isProcessing = false;
    }
  }

  async sendQuestion() {
    const question = this.questionInput.value.trim();
    if (!question) return;

    try {
      this.addMessage(question, "user");
      this.questionInput.value = "";
      this.sendButton.disabled = true;

      const response = await this.api.chat(
        this.videoId,
        question,
        this.conversationId
      );

      this.conversationId = response.conversationId;
      this.addMessage(response.response, "bot");
    } catch (error) {
      console.error("Error sending question:", error);
      this.addMessage("Sorry, something went wrong. Please try again.", "bot");
    } finally {
      this.sendButton.disabled = false;
      this.questionInput.focus();
    }
  }

  addMessage(text, type) {
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", `${type}-message`);
    messageElement.textContent = text;
    this.messagesContainer.appendChild(messageElement);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  showLoading(message) {
    this.loadingElement.style.display = "block";
    this.statusMessage.textContent = message;
    this.sendButton.disabled = true;
  }

  hideLoading() {
    this.loadingElement.style.display = "none";
    this.sendButton.disabled = false;
  }

  enableChat() {
    this.sendButton.disabled = false;
    this.questionInput.disabled = false;
  }

  showError(message) {
    this.addMessage(`Error: ${message}`, "bot");
  }
}

// Initialize popup
document.addEventListener("DOMContentLoaded", () => {
  new ChatbotPopup();
});
