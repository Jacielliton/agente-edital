# backend/openrouter_api.py
import httpx
from typing import List
from pydantic import BaseModel
from fastapi import HTTPException

# Schemas para o retorno da API
class OpenRouterModelInfo(BaseModel):
    id: str
    name: str
    context_length: int
    is_free: bool

class OpenRouterModelsResponse(BaseModel):
    free_models: List[OpenRouterModelInfo]
    paid_models: List[OpenRouterModelInfo]

async def get_top_models() -> OpenRouterModelsResponse:
    """Busca o catálogo do OpenRouter e extrai os Top 5 mais populares de cada categoria."""
    try:
        async with httpx.AsyncClient() as client:
            # A API retorna a lista já pré-ordenada por popularidade/uso na plataforma
            response = await client.get("https://openrouter.ai/api/v1/models", timeout=15.0)
            
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="Falha ao comunicar com a API do OpenRouter")
            
        data = response.json()
        all_models = data.get("data", [])
        
        free_models = []
        paid_models = []
        
        # Lemos a lista na ordem original de popularidade do OpenRouter
        for model in all_models:
            # Se já temos os Top 5 de ambas as categorias, paramos o loop (ultra performance)
            if len(free_models) >= 5 and len(paid_models) >= 5:
                break
                
            model_id = model.get("id")
            name = model.get("name", "Sem Nome")
            pricing = model.get("pricing", {})
            
            if not model_id or not name:
                continue
                
            try:
                prompt_price = float(pricing.get("prompt") or 0)
                completion_price = float(pricing.get("completion") or 0)
            except ValueError:
                prompt_price, completion_price = 0.0, 0.0
                
            is_free = (prompt_price == 0.0 and completion_price == 0.0)
            
            model_info = OpenRouterModelInfo(
                id=model_id,
                name=name,
                context_length=model.get("context_length", 0),
                is_free=is_free
            )
            
            # Adiciona apenas se ainda não atingiu o limite de 5 (Top 5)
            if is_free and len(free_models) < 5:
                free_models.append(model_info)
            elif not is_free and len(paid_models) < 5:
                paid_models.append(model_info)
                
        # NOTA: Não usamos "sorted()" aqui! 
        # Isso garante que a ordem nativa de popularidade do site seja mantida.
        
        return OpenRouterModelsResponse(
            free_models=free_models,
            paid_models=paid_models
        )
        
    except Exception as e:
        print(f"Erro no módulo openrouter_api: {e}")
        raise HTTPException(status_code=500, detail="Erro interno ao listar os modelos diretos do site.")