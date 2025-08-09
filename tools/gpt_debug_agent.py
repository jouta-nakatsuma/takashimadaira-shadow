from openai import OpenAI
import subprocess
import os
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def run_logs():
    print("📦 docker compose logs app を取得中...")
    result = subprocess.run(["docker", "compose", "logs", "app"], capture_output=True, text=True, check=True)
    return result.stdout[-2000:]  # 最新ログを取得

def ask_agent(logs: str):
    messages = [
        {
            "role": "system",
            "content": "あなたはFlask + Docker + Pythonの熟練デバッグAIです。安全・確実な手順を大事にしてください。"
        },
        {
            "role": "user",
            "content": f"""
以下はFlaskアプリケーション（AIウグイス）のログです。
起動時に問題がありそうです。原因と推奨される確認・修正手順を提示してください。
{logs}
"""
        }
    ]
    print("🤖 GPTエージェントに質問しています...")
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.2,
    )
    return response.choices[0].message.content

def main():
    logs = run_logs()
    answer = ask_agent(logs)
    print("\n--- 🧠 GPTエージェントの提案 ---\n")
    print(answer)

if __name__ == "__main__":
    main()
