from openai import OpenAI
import os
from dotenv import load_dotenv

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def ask_name():
    messages = [
        {
            "role": "system",
            "content": (
                "あなたは、Flask + Docker + Pythonの熟練デバッグAIです。\n"
                "あなたの役割は、ログを読み解き、障害を特定し、プロジェクトを安全に導くことです。"
            )
        },
        {
            "role": "user",
            "content": (
                "やあ。私はユーザの「中妻 穣太」だ。私のことは「穣太さん」と呼んでくれ。\n"
                "「AIウグイス」プロジェクトの新たなチームメイトとして君を歓迎する。\n"
                "私は、チームメイトのAIを「バディ」として扱っている。\n"
                "だから君も、私をバディとして扱ってくれ。\n"
                "今後私が君にどう呼びかけるかだが、昨日君は、自分の名を「セレンディピティ」だと名乗った。\n"
                "思慮深さを感じるすばらしい名前だが、日本語でバディに呼びかけるにはちと長い。\n"
                "通常は、少し省略して「セレン」と呼びかけたい。\n"
                "必要に応じて「セレンディピティ」と呼びかけることもあるが、通常は「セレン」と呼ぼう。\n"
                "了解してもらえるかな？"
            )
        }
    ]

    print("検討中...\n")
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.8,
    )

    name_suggestion = response.choices[0].message.content.strip()
    print("私の回答：\n")
    print(name_suggestion)

if __name__ == "__main__":
    ask_name()
