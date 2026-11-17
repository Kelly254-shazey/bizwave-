from fastapi import FastAPI
from app.api.routes import router

app = FastAPI(
    title="BizWave Intelligence Service",
    version="1.0.0",
    description="Statistical forecasting, stockout-aware demand planning, cash-flow projection, anomaly detection, and RFM segmentation for Kenyan SMEs.",
)

app.include_router(router)


@app.get("/health")
def health():
    return {"status": "healthy", "service": "bizwave-intelligence", "version": "1.0.0"}
