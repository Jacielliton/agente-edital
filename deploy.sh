#!/bin/bash

echo "🔄 Baixando atualizações do Git..."
git pull origin main

echo "📦 Atualizando o Backend..."
cd backend
source venv/bin/activate
# Instala novas bibliotecas se você tiver adicionado alguma
# pip install -r requirements.txt 

echo "🎨 Atualizando o Frontend..."
cd ../frontend
npm install

# Garante que o frontend da VPS aponte para a API em produção (HTTPS)
# e não para o localhost do seu PC
echo "🔗 Ajustando URLs da API para Produção..."
grep -rl "localhost:8000" . | xargs -r sed -i 's|http://localhost:8000|https://agente-edital.tecnopriv.top/api|g'
grep -rl "localhost:8001" . | xargs -r sed -i 's|http://localhost:8001|https://agente-edital.tecnopriv.top/api|g'

echo "🏗️ Construindo arquivos estáticos do React..."
npm run build

echo "🚀 Reiniciando o serviço do Backend..."
sudo systemctl restart agente-edital

echo "✅ Sistema atualizado com sucesso!"