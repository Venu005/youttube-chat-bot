export class APIService {
  constructor(baseUrl = "http://localhost:3000/api") {
    this.baseUrl = baseUrl;
  }

  async processVideo(videoId, metadata) {
    try {
      const response = await fetch(`${this.baseUrl}/chatbot/process-video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ videoId, metadata }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to process video");
      }

      return data;
    } catch (error) {
      console.error("API Error:", error);
      throw new Error(error.message || "Network error while processing video");
    }
  }

  async checkVideoStatus(videoId) {
    try {
      const response = await fetch(
        `${this.baseUrl}/chatbot/video-status/${videoId}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to check video status");
      }

      return data;
    } catch (error) {
      console.error("API Error:", error);
      throw new Error(error.message || "Network error while checking status");
    }
  }

  async chat(videoId, question, conversationId = null) {
    try {
      const response = await fetch(`${this.baseUrl}/chatbot/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ videoId, question, conversationId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      return data;
    } catch (error) {
      console.error("API Error:", error);
      throw new Error(error.message || "Network error during chat");
    }
  }
}
