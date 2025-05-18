from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from transformers import AutoImageProcessor, AutoModelForImageClassification, AutoTokenizer, AutoModelForCausalLM
from PIL import Image
import torch
import torch.nn.functional as F
import io
import re
from pymongo import MongoClient
import spacy
from spacy.tokens import Doc
from spacy.vocab import Vocab
from spacy.matcher import Matcher, PhraseMatcher
from underthesea import word_tokenize
import json
import requests
from typing import Optional, List
from datetime import datetime
from bson import ObjectId
from dotenv import load_dotenv

# Kết nối MongoDB
client = MongoClient("mongodb://localhost:27017")
db = client["recipedb"]
recipes_collection = db["recipes"]
sessions_collection = db["chat_sessions"]
messages_collection = db["chat_history"]
counters_collection = db["counters"]

# Khởi tạo FastAPI
app = FastAPI()

# Cấu hình CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Models
class User(BaseModel):
    uid: str
    email: str
    displayName: str

class ChatSession(BaseModel):
    uid: str
    sessionId: str
    title: Optional[str] = ""
    createdAt: Optional[datetime] = datetime.utcnow()

class ChatMessage(BaseModel):
    uid: str
    sessionId: str
    sender: str 
    content: str
    image: Optional[str] = ""
    timestamp: Optional[datetime] = datetime.utcnow()
    
class UpdateSessionTitle(BaseModel):
    title: str

# Routes
@app.post("/user")
def create_or_get_user(user: User):
    existing_user = db.users.find_one({"uid": user.uid})
    if existing_user:
        return {"message": "User already exists"}
    db.users.insert_one(user.dict())
    return {"message": "User created successfully"}

@app.post("/session")
def create_chat_session(session: ChatSession):
    try:
        session_data = session.dict()
        sessions_collection.insert_one(session_data)
        return {"message": "Session created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/sessions/{uid}", response_model=List[ChatSession])
def get_user_sessions(uid: str):
    if uid == "guest":
        # Không trả về session nào cho khách
        return []
    sessions = list(sessions_collection.find({"uid": uid}, {"_id": 0}))
    return sessions

@app.delete("/session/{session_id}")
async def delete_session_and_messages(session_id: str):
    try:
        # Xóa session
        session_result = sessions_collection.delete_one({"sessionId": session_id})
        if session_result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Session not found")

        # Xóa lịch sử tin nhắn liên quan
        messages_result = messages_collection.delete_many({"sessionId": session_id})

        return {
            "message": "Session and related messages deleted successfully",
            "deleted_messages_count": messages_result.deleted_count,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/session/{session_id}")
async def update_session_title(session_id: str, session: UpdateSessionTitle):
    try:
        result = sessions_collection.update_one(
            {"sessionId": session_id}, {"$set": {"title": session.title}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"message": "Session title updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/messages")
def get_messages(sessionId: str = Query(...)):
    messages = list(messages_collection.find({"sessionId": str(sessionId)}, {"_id": 0}))
    return {"messages": messages}
    
@app.post("/message")
def save_chat_message(message: ChatMessage):
    data = message.dict()
    data["sessionId"] = str(data["sessionId"])
    db.chat_history.insert_one(data)
    return {"message": "Message saved"}


# Model nhận diện hình ảnh
image_model_name = "vuongnhathien/ConvnextV2-base-30VNFoods"
image_model = AutoModelForImageClassification.from_pretrained(image_model_name, cache_dir="./model")
image_processor = AutoImageProcessor.from_pretrained(image_model_name, cache_dir="./model")
image_model.eval()

@app.post("/predict_with_recipe")
async def predict_with_recipe(file: UploadFile = File(...)):
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    inputs = image_processor(images=image, return_tensors="pt")

    with torch.no_grad():
        outputs = image_model(**inputs)
        logits = outputs.logits
        probabilities = F.softmax(logits, dim=-1)
        predicted_class_idx = logits.argmax(-1).item()
        confidence = probabilities[0][predicted_class_idx].item()

    label = image_model.config.id2label.get(predicted_class_idx, "Unknown")
    recipe = recipes_collection.find_one({"name": label}, {"_id": 0})

    return {
        "predicted_label": label,
        "confidence": confidence,
        "recipe": recipe or None
    }

class QueryRequest(BaseModel):
    query: str

# Khởi tạo spaCy
nlp = spacy.blank("vi")

class UndertheseaTokenizer:
    def __init__(self, vocab: Vocab):
        self.vocab = vocab

    def __call__(self, text: str) -> Doc:
        # Làm sạch văn bản: loại bỏ dấu phẩy dư thừa giữa các từ
        text = re.sub(r'\s*,\s*', ' ', text)
        tokens = word_tokenize(text)
        
        words = []
        spaces = []

        for i, token in enumerate(tokens):
            words.append(token)
            # Giả định có khoảng trắng giữa các token trừ token cuối cùng
            spaces.append(True if i < len(tokens) - 1 else False)

        return Doc(self.vocab, words=words, spaces=spaces)

nlp.tokenizer = UndertheseaTokenizer(nlp.vocab)

# Khởi tạo Matcher và PhraseMatcher
matcher = Matcher(nlp.vocab)
phrase_matcher = PhraseMatcher(nlp.vocab, attr="LOWER")

dishes = [doc["name"].lower() for doc in recipes_collection.find({}, {"name": 1})]

# Thêm danh sách món ăn và nguyên liệu vào PhraseMatcher
dish_patterns = [nlp(dish) for dish in dishes]
phrase_matcher.add("DISH", dish_patterns)


# Quy tắc nhận diện ý định tìm món
intent_patterns = [
    [{"LOWER": {"IN": ["làm gì", "món gì", "nấu gì", "có gì", "gợi ý", "làm món gì"]}}],
    [{"LOWER": "làm"}, {"LOWER": "gì"}, {"LOWER": "ngon", "OP": "?"}],
]
matcher.add("INTENT_FIND_DISH", intent_patterns)


# Hàm trích xuất món ăn, nguyên liệu
def extract_entities(text):
    doc = nlp(text.lower())
    matches = matcher(doc)
    phrase_matches = phrase_matcher(doc)
    extracted_dish = None

    # Trích xuất từ PhraseMatcher
    for match_id, start, end in phrase_matches:
        span = doc[start:end].text.lower()
        match_label = nlp.vocab.strings[match_id]
        if match_label == "DISH":
            extracted_dish = span

    # Trích xuất từ Matcher
    for match_id, start, end in matches:
        match_label = nlp.vocab.strings[match_id]
        if match_label == "INTENT_FIND_DISH":
            pass  

    return {
        "dish": extracted_dish,
    }

# Truy vấn MongoDB
def query_recipes(entities):
    if entities["dish"]:
        recipe = recipes_collection.find_one({"name": {"$regex": entities["dish"], "$options": "i"}})
        if recipe:
            recipe["_id"] = str(recipe["_id"])
            return {"type": "recipe", "data": recipe}
        return {"type": "error", "message": f"Không tìm thấy món {entities['dish']}"}
    return {"type": "error", "message": "Không nhận diện được món ăn hoặc nguyên liệu"}

@app.post("/recipes_search")
async def search_recipes(request: QueryRequest):
    try:
        query = request.query
        if not query:
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        entities = extract_entities(query)
        result = query_recipes(entities)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing query: {str(e)}")

class Recipe(BaseModel):
    id: int
    name: str
    ingredients: List[str]
    cooking_method: List[str]

@app.post("/add-recipes")
def add_recipe(recipe: Recipe):
    try:
        print("Công thức nhận được từ frontend:", recipe.dict())

        # Kiểm tra xem món ăn đã tồn tại chưa
        existing_recipe = recipes_collection.find_one({"name": {"$regex": recipe.name, "$options": "i"}})
        if existing_recipe:
            raise HTTPException(status_code=400, detail="Recipe already exists")

        # Lấy giá trị id mới từ collection counters
        counter = counters_collection.find_one_and_update(
            {"_id": "recipe_id"},
            {"$inc": {"sequence_value": 1}},
            upsert=True,
            return_document=True
        )
        new_id = counter["sequence_value"]

        # Thêm món ăn mới vào collection
        recipe_data = recipe.dict()
        recipe_data["id"] = new_id
        recipes_collection.insert_one(recipe_data)

        return {"message": "Recipe added successfully", "id": new_id}
    except Exception as e:
        print("Lỗi:", str(e))
        raise HTTPException(status_code=500, detail=f"Error adding recipe: {str(e)}")
    
