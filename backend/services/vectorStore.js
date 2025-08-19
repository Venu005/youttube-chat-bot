import { PineconeStore } from "@langchain/pinecone";
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import dotenv from "dotenv";
dotenv.config();
export class VectorStoreService {
  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Initialize Pinecone client
    this.pinecone = new PineconeClient({
      apiKey: process.env.PINECONE_API_KEY,
    });

    this.vectorStores = new Map(); // In-memory cache
  }


  async initializePineconeIndex(indexName) {
    try {
      // Check if index exists
      const indexList = await this.pinecone.listIndexes();
      const indexExists = indexList.indexes?.some(
        (index) => index.name === indexName
      );

      if (!indexExists) {
        console.log(`Creating Pinecone index: ${indexName}`);
        await this.pinecone.createIndex({
          name: indexName,
          dimension: 1536, 
          metric: "cosine",
          
          spec: {
            serverless: {
              cloud: "aws",
              region: "us-east-1",
            },
            
          },
        });

        console.log("Waiting for index to be ready...");
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }

      return this.pinecone.index(indexName);
    } catch (error) {
      console.error("Error initializing Pinecone index:", error);
      throw error;
    }
  }

  async createVectorStore(documents, videoId) {
    try {
      const indexName = process.env.PINECONE_INDEX || "youtube-chatbot";
      const pineconeIndex = await this.initializePineconeIndex(indexName);

      console.log(
        `Creating vector store for video ${videoId} with ${documents.length} documents`
      );

      // Create vector store from documents with namespace
      const vectorStore = await PineconeStore.fromDocuments(
        documents,
        this.embeddings,
        {
          pineconeIndex,
          namespace: `video_${videoId}`, // Use videoId as namespace for isolation
          maxConcurrency: 5,
        }
      );

      // Cache in memory
      this.vectorStores.set(videoId, vectorStore);

      console.log(`Vector store created for video: ${videoId}`);

      return vectorStore;
    } catch (error) {
      console.error(`Error creating vector store for video ${videoId}:`, error);
      throw error;
    }
  }

  async loadVectorStore(videoId) {
    try {
      // Check memory cache first
      if (this.vectorStores.has(videoId)) {
        console.log(`Using cached vector store for video: ${videoId}`);
        return this.vectorStores.get(videoId);
      }

      const indexName = process.env.PINECONE_INDEX || "youtube-chatbot";
      const pineconeIndex = await this.initializePineconeIndex(indexName);

      console.log(`Loading vector store for video: ${videoId}`);

      // Create vector store instance pointing to existing namespace
      const vectorStore = new PineconeStore(this.embeddings, {
        pineconeIndex,
        namespace: `video_${videoId}`,
        maxConcurrency: 5,
      });

      // Cache in memory
      this.vectorStores.set(videoId, vectorStore);

      return vectorStore;
    } catch (error) {
      console.error(`Error loading vector store for video ${videoId}:`, error);
      throw error;
    }
  }

  async vectorStoreExists(videoId) {
    try {
      // Check memory cache first
      if (this.vectorStores.has(videoId)) {
        return true;
      }

      const indexName = process.env.PINECONE_INDEX || "youtube-chatbot";
      const pineconeIndex = await this.initializePineconeIndex(indexName);

      // Check if namespace has any vectors
      const stats = await pineconeIndex.describeIndexStats();
      const namespaceStats = stats.namespaces?.[`video_${videoId}`];

      return namespaceStats && namespaceStats.vectorCount > 0;
    } catch (error) {
      console.error(
        `Error checking vector store existence for video ${videoId}:`,
        error
      );
      return false;
    }
  }


  async similaritySearch(videoId, query, k = 3) {
    try {
      const vectorStore = await this.loadVectorStore(videoId);

      console.log(
        `Performing similarity search for video ${videoId} with query: "${query}"`
      );

      const results = await vectorStore.maxMarginalRelevanceSearch(query,{
        k:2,
        fetchK :k*2,
        lambda : 0.7
      });

      console.log(`Found ${results.length} relevant documents`);

      return results;
    } catch (error) {
      console.error(
        `Error performing similarity search for video ${videoId}:`,
        error
      );
      throw error;
    }
  }


  async similaritySearchWithScore(videoId, query, k = 3) {
    try {
      const vectorStore = await this.loadVectorStore(videoId);

      const results = await vectorStore.similaritySearchWithScore(query, k);

      console.log(`Found ${results.length} relevant documents with scores`);

      return results;
    } catch (error) {
      console.error(
        `Error performing similarity search with scores for video ${videoId}:`,
        error
      );
      throw error;
    }
  }


  async deleteVectorStore(videoId) {
    try {
      // Remove from memory cache
      this.vectorStores.delete(videoId);

      const indexName = process.env.PINECONE_INDEX || "youtube-chatbot";
      const pineconeIndex = await this.initializePineconeIndex(indexName);

      // Delete all vectors in the namespace
      await pineconeIndex.namespace(`video_${videoId}`).deleteAll();

      console.log(`Vector store deleted for video: ${videoId}`);
    } catch (error) {
      console.error(`Error deleting vector store for video ${videoId}:`, error);
      throw error;
    }
  }

  async getProcessedVideos() {
    try {
      const indexName = process.env.PINECONE_INDEX || "youtube-chatbot";
      const pineconeIndex = await this.initializePineconeIndex(indexName);

      const stats = await pineconeIndex.describeIndexStats();
      const namespaces = Object.keys(stats.namespaces || {});

      // Extract video IDs from namespace names
      const videoIds = namespaces
        .filter((ns) => ns.startsWith("video_"))
        .map((ns) => ns.replace("video_", ""))
        .filter((id) => stats.namespaces[`video_${id}`].vectorCount > 0);

      return videoIds;
    } catch (error) {
      console.error("Error getting processed videos:", error);
      return [];
    }
  }

 
  async getStorageStats() {
    try {
      const processedVideos = await this.getProcessedVideos();
      const memoryCacheSize = this.vectorStores.size;

      const indexName = process.env.PINECONE_INDEX || "youtube-chatbot";
      const pineconeIndex = await this.initializePineconeIndex(indexName);
      const stats = await pineconeIndex.describeIndexStats();

      return {
        processedVideos: processedVideos.length,
        memoryCacheSize,
        videoIds: processedVideos,
        totalVectors: stats.totalVectorCount,
        indexDimension: stats.dimension,
      };
    } catch (error) {
      console.error("Error getting storage stats:", error);
      return {
        processedVideos: 0,
        memoryCacheSize: 0,
        videoIds: [],
        totalVectors: 0,
        indexDimension: 0,
      };
    }
  }

 
  clearMemoryCache() {
    this.vectorStores.clear();
    console.log("Memory cache cleared");
  }
}
