#!/bin/bash
# Usage: ./scripts/set-llm.sh <provider> [model] [embedding-model]
#
# Providers:
#   openai       - OpenAI direct
#   openrouter   - OpenRouter (any model)
#   ollama       - Local Ollama (no key needed)
#   together     - Together.ai
#
# Examples:
#   ./scripts/set-llm.sh openai gpt-5-nano
#   ./scripts/set-llm.sh openrouter anthropic/claude-sonnet-4-20250514
#   ./scripts/set-llm.sh ollama llama3
#   ./scripts/set-llm.sh together meta-llama/Llama-3-8b-chat-hf

set -e

PROVIDER="${1}"

if [ -z "$PROVIDER" ]; then
  echo "Available providers:"
  echo "  openai       - OpenAI direct"
  echo "  openrouter   - OpenRouter (any model)"
  echo "  ollama       - Local Ollama"
  echo "  together     - Together.ai"
  echo ""
  echo "Usage: ./scripts/set-llm.sh <provider> [model] [embedding-model]"
  exit 1
fi

# Get existing env vars (suppress errors for vars that don't exist)
get_env() {
  npx convex env get "$1" 2>/dev/null || echo ""
}

# Only prompt for API key if one isn't already set for this provider
prompt_key() {
  local env_var="$1"
  local provider_name="$2"
  local existing
  existing=$(get_env "$env_var")
  if [ -n "$existing" ]; then
    echo "Using existing $provider_name API key (${existing:0:8}...)"
    API_KEY="$existing"
  else
    read -rsp "$provider_name API key: " API_KEY
    echo ""
    if [ -z "$API_KEY" ]; then
      echo "Error: API key required"
      exit 1
    fi
  fi
}

# Clear all LLM env vars first
echo "Clearing existing LLM env vars..."
for var in OPENAI_API_KEY OPENAI_CHAT_MODEL OPENAI_EMBEDDING_MODEL \
           TOGETHER_API_KEY TOGETHER_CHAT_MODEL TOGETHER_EMBEDDING_MODEL \
           LLM_API_URL LLM_API_KEY LLM_MODEL LLM_EMBEDDING_MODEL LLM_PROVIDER; do
  npx convex env unset "$var" 2>/dev/null || true
done

case "$PROVIDER" in
  openai)
    MODEL="${2:-gpt-5-nano}"
    EMBEDDING="${3:-text-embedding-ada-002}"
    prompt_key OPENAI_API_KEY "OpenAI"
    npx convex env set OPENAI_API_KEY "$API_KEY"
    npx convex env set OPENAI_CHAT_MODEL "$MODEL"
    npx convex env set OPENAI_EMBEDDING_MODEL "$EMBEDDING"
    echo ""
    echo "Set: OpenAI | chat=$MODEL | embeddings=$EMBEDDING"
    echo "NOTE: EMBEDDING_DIMENSION must be 1536 in convex/util/llm.ts for OpenAI"
    ;;

  openrouter)
    MODEL="${2}"
    EMBEDDING="${3:-openai/text-embedding-ada-002}"
    if [ -z "$MODEL" ]; then
      echo "Error: model required for OpenRouter. Example: openai/gpt-5-nano"
      exit 1
    fi
    prompt_key LLM_API_KEY "OpenRouter"
    npx convex env set LLM_API_URL "https://openrouter.ai/api"
    npx convex env set LLM_API_KEY "$API_KEY"
    npx convex env set LLM_MODEL "$MODEL"
    npx convex env set LLM_EMBEDDING_MODEL "$EMBEDDING"
    echo ""
    echo "Set: OpenRouter | chat=$MODEL | embeddings=$EMBEDDING"
    echo "NOTE: Check EMBEDDING_DIMENSION in convex/util/llm.ts matches your embedding model"
    ;;

  ollama)
    MODEL="${2:-llama3}"
    EMBEDDING="${3:-mxbai-embed-large}"
    echo "Set: Ollama | chat=$MODEL | embeddings=$EMBEDDING"
    echo "NOTE: EMBEDDING_DIMENSION must be 1024 in convex/util/llm.ts for Ollama default"
    echo "Make sure ollama is running: ollama serve"
    ;;

  together)
    MODEL="${2:-meta-llama/Llama-3-8b-chat-hf}"
    EMBEDDING="${3:-togethercomputer/m2-bert-80M-8k-retrieval}"
    prompt_key TOGETHER_API_KEY "Together.ai"
    npx convex env set TOGETHER_API_KEY "$API_KEY"
    npx convex env set TOGETHER_CHAT_MODEL "$MODEL"
    npx convex env set TOGETHER_EMBEDDING_MODEL "$EMBEDDING"
    echo ""
    echo "Set: Together.ai | chat=$MODEL | embeddings=$EMBEDDING"
    echo "NOTE: EMBEDDING_DIMENSION must be 768 in convex/util/llm.ts for Together.ai"
    ;;

  *)
    echo "Unknown provider: $PROVIDER"
    exit 1
    ;;
esac

echo ""
echo "If you changed embedding providers, you MUST:"
echo "  1. Update EMBEDDING_DIMENSION in convex/util/llm.ts"
echo "  2. Wipe the DB: npx convex run testing:wipeAllTables"
