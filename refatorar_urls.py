import os

# Pastas e arquivos que o script NUNCA deve tocar para evitar quebrar o projeto
IGNORE_DIRS = {'node_modules', 'venv', '.git', '__pycache__', 'dist', 'build'}
# Apenas arquivos de código serão lidos
ALLOWED_EXTENSIONS = {'.jsx', '.js', '.ts', '.tsx', '.py', '.html', '.env', '.sh'}

def process_files(base_path, old_text, new_text):
    modificados = 0
    for root, dirs, files in os.walk(base_path):
        # Remove as pastas ignoradas da varredura
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        
        for file in files:
            ext = os.path.splitext(file)[1]
            if ext in ALLOWED_EXTENSIONS:
                filepath = os.path.join(root, file)
                try:
                    # Lê o conteúdo do arquivo
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Se encontrar o texto antigo, faz a substituição
                    if old_text in content:
                        new_content = content.replace(old_text, new_text)
                        
                        # Salva o arquivo com o novo conteúdo
                        with open(filepath, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                            
                        print(f"✅ Arquivo atualizado: {filepath}")
                        modificados += 1
                except Exception as e:
                    print(f"❌ Erro ao ler o arquivo {filepath}: {e}")
    
    return modificados

def main():
    print("\n" + "="*50)
    print(" 🛠️  AGENTE EDITAL - SUBSTITUIDOR DE URLs")
    print("="*50)
    
    # --- PASSO 1: O QUE PROCURAR ---
    print("\n[1] Escolha o que deseja SUBSTITUIR (Texto Antigo):")
    print(" 1. http://localhost:8000")
    print(" 2. http://localhost:8001")
    print(" 3. Digitar um valor personalizado")
    
    op1 = input(" 👉 Digite a opção: ").strip()
    if op1 == '1': 
        old_text = "http://localhost:8000"
    elif op1 == '2': 
        old_text = "http://localhost:8001"
    else: 
        old_text = input(" ✏️  Digite o texto exato a ser procurado: ").strip()

    # --- PASSO 2: PELO QUE SUBSTITUIR ---
    print("\n[2] Escolha o NOVO VALOR (Texto Novo):")
    print(" 1. ${import.meta.env.VITE_API_URL}   <-- (Use apenas no Frontend!)")
    print(" 2. https://agente-edital.tecnopriv.top/api")
    print(" 3. Digitar um valor personalizado")
    
    op2 = input(" 👉 Digite a opção: ").strip()
    if op2 == '1': 
        new_text = "${import.meta.env.VITE_API_URL}"
    elif op2 == '2': 
        new_text = "https://agente-edital.tecnopriv.top/api"
    else: 
        new_text = input(" ✏️  Digite o novo texto: ").strip()

    # --- PASSO 3: ONDE APLICAR ---
    print("\n[3] Em quais pastas deseja aplicar essa modificação?")
    print(" 1. Apenas no Frontend (Seguro para VITE_API_URL)")
    print(" 2. Apenas no Backend")
    print(" 3. Em todo o projeto (Frontend e Backend)")
    
    op3 = input(" 👉 Digite a opção: ").strip()
    pastas_alvo = []
    if op3 == '1': 
        pastas_alvo = ['frontend']
    elif op3 == '2': 
        pastas_alvo = ['backend']
    else: 
        pastas_alvo = ['.'] # Pega a raiz toda

    # --- EXECUÇÃO ---
    total_modificados = 0
    print("\n🚀 Iniciando varredura...")
    
    for pasta in pastas_alvo:
        if os.path.exists(pasta):
            print(f"🔍 Vasculhando: {pasta}")
            total_modificados += process_files(pasta, old_text, new_text)
        else:
            print(f"⚠️  Atenção: A pasta '{pasta}' não foi encontrada no diretório atual.")

    print("\n" + "="*50)
    print(f" 🎉 Resumo: {total_modificados} arquivos foram modificados com sucesso!")
    print("="*50 + "\n")

if __name__ == "__main__":
    main()