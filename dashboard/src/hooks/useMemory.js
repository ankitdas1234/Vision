import { useState } from "react";
import { memoryApi } from "../api/memory";

export function useMemory() {
  const [results, setResults] = useState(null);
  const search = async (query) => setResults(await memoryApi.search(query));
  return { results, search };
}
