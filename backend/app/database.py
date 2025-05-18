from pymongo import MongoClient # type: ignore
from dotenv import load_dotenv # type: ignore
import os

load_dotenv()

MONGO_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("MONGODB_DB")
COLLECTION_NAME = os.getenv("MONGODB_COLLECTION")

client = MongoClient(MONGO_URI)
db = client[DB_NAME]
recipes_collection = db[COLLECTION_NAME]
