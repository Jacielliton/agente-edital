import tkinter as tk
from tkinter import scrolledtext, messagebox
import re
import html
import json
import base64

def extrair_dados():
    # Pega o texto da caixa de entrada
    texto_entrada = caixa_entrada.get("1.0", tk.END).strip()
    
    if not texto_entrada:
        messagebox.showwarning("Aviso", "Por favor, insira os dados na caixa de entrada.")
        return

    linhas_saida = []
    
    # Processa linha por linha para lidar com as regras
    for linha in texto_entrada.split('\n'):
        linha = linha.strip()
        if not linha:
            continue
            
        # Busca os atributos Comment e Match usando Expressões Regulares
        comentario_match = re.search(r'Comment="([^"]*)"', linha)
        match_attr_match = re.search(r'Match="([^"]*)"', linha)
        
        if comentario_match and match_attr_match:
            comentario = comentario_match.group(1)
            match_raw = match_attr_match.group(1)
            
            try:
                # 1. Transforma os &quot; de volta em aspas duplas (")
                match_json_str = html.unescape(match_raw)
                
                # 2. Converte a string do Match em um dicionário Python
                match_data = json.loads(match_json_str)
                
                # 3. Pega o primeiro item da lista "matches"
                b64_str_with_prefix = match_data.get("matches", [""])[0]
                
                # 4. Remove o prefixo "%%" e decodifica o base64
                if b64_str_with_prefix.startswith("%%"):
                    b64_str = b64_str_with_prefix[2:]
                    
                    # Adiciona padding "=" se o base64 estiver incompleto (evita erros de decodificação)
                    b64_str += "=" * ((4 - len(b64_str) % 4) % 4)
                    
                    # Decodifica base64 para string
                    decoded_bytes = base64.b64decode(b64_str)
                    decoded_json_str = decoded_bytes.decode('utf-8')
                    
                    # 5. Converte o JSON decodificado para dicionário e pega o "value"
                    decoded_data = json.loads(decoded_json_str)
                    link = decoded_data.get("value", "LINK_NAO_ENCONTRADO")
                    
                    # Formata a saída
                    linhas_saida.append(f"COMENTÁRIO: {comentario} - LINK: {link}")
                else:
                    linhas_saida.append(f"COMENTÁRIO: {comentario} - [Formato Base64 não reconhecido]")
                    
            except Exception as e:
                linhas_saida.append(f"ERRO ao processar '{comentario}': {str(e)}")

    # Exibe o resultado na caixa de saída
    caixa_saida.delete("1.0", tk.END)
    caixa_saida.insert(tk.END, "\n".join(linhas_saida))


# --- Configuração da Interface Gráfica (GUI) ---
janela = tk.Tk()
janela.title("Extrator de Links Base64")
janela.geometry("800x600")

# Label e Caixa de Texto para Entrada
tk.Label(janela, text="Cole as tags <ResponseRule ...> abaixo:", font=("Arial", 10, "bold")).pack(pady=5, anchor="w", padx=10)
caixa_entrada = scrolledtext.ScrolledText(janela, height=12, wrap=tk.WORD)
caixa_entrada.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

# Botão de Processamento
btn_processar = tk.Button(janela, text="Extrair e Formatar Dados", bg="#4CAF50", fg="white", font=("Arial", 12, "bold"), command=extrair_dados)
btn_processar.pack(pady=10)

# Label e Caixa de Texto para Saída
tk.Label(janela, text="Resultado Formatado:", font=("Arial", 10, "bold")).pack(pady=5, anchor="w", padx=10)
caixa_saida = scrolledtext.ScrolledText(janela, height=12, wrap=tk.WORD, bg="#f4f4f4")
caixa_saida.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

# Inicia a aplicação
janela.mainloop()