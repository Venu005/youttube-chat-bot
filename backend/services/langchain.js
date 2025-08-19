import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";

export class LangChainService {
  constructor() {
    this.llm = new ChatOpenAI({
      modelName: "gpt-4-turbo-preview",
      temperature: 0.2,
    });

    this.prompt = PromptTemplate.fromTemplate(`
      You are a helpful assistant for YouTube video content.
      Answer ONLY from the provided transcript context.
      If the context is insufficient, just say you don't know.

      Context: {context}
      Question: {question}
    `);
  }

  async splitText(transcript) {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    return await splitter.createDocuments([transcript]);
  }

  async generateResponse(question, relevantDocs) {
    try {
      const context = relevantDocs.map((doc) => doc.pageContent).join("\n\n");
      const formattedPrompt = await this.prompt.format({
        context: context,
        question: question,
      });

      const response = await this.llm.invoke(formattedPrompt);
      return response.content;
    } catch (error) {
      console.error("Error generating response:", error);
      throw error;
    }
  }
}
