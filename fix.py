from pymongo import MongoClient
from datetime import datetime

client = MongoClient("mongodb://localhost:27017")
db = client["recipedb"]  # Tên database của bạn

# Khởi tạo giá trị ban đầu cho id tự động tăng
if not db.counters.find_one({"_id": "recipe_id"}):
    db.counters.insert_one({"_id": "recipe_id", "sequence_value": 0})
    print("Collection 'counters' đã được khởi tạo.")
else:
    print("Collection 'counters' đã tồn tại.")