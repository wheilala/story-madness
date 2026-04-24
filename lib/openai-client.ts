import OpenAI from "openai";
import { loadEnvConfig } from "@next/env";

let client: OpenAI | null = null;
let envLoaded = false;

export function getOpenAIClient(): OpenAI | null {
  if (!envLoaded) {
    loadEnvConfig(process.cwd());
    envLoaded = true;
  }
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}
