from openai import OpenAI
import anthropic

client = OpenAI()

def summarize(text: str) -> str:
    resp = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": text}],
    )
    return resp.choices[0].message.content

# Already retired: calls fail today
LEGACY = 'claude-3-haiku-20240307'

# No drop-in replacement, must be fixed by hand
VIDEO = "sora-2"

# The word gpt-4 in a comment is ignored, only string literals count
