import os
from typing import List, Dict, Optional, Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import wandb
from wandb.apis.public.runs import Run
import dotenv
from functools import reduce
from urllib.parse import urljoin

# Load environment variables from .env file if it exists
dotenv.load_dotenv()

app = FastAPI(title="Wandb Run Comparer API")

# Set up CORS to allow the frontend to make requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Frontend URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Default values
DEFAULT_ENTITY = os.environ.get("WANDB_ENTITY", "my_cool_org")
DEFAULT_PROJECT = os.environ.get("WANDB_PROJECT", "my_cool_project")
DEFAULT_PAGE_SIZE = 20
# you'll probably want to edit these
DEFAULT_METRICS = [
    "main/samples",
    "main/qualities",
    "main/benchmark_0",
    "main/benchmark_1",
    "main/benchmark_2",
    "main/benchmark_3",
    "main/benchmark_4",
    "main/reals"
]

# Check if WANDB_API_KEY is set
if not os.environ.get("WANDB_API_KEY"):
    print("Warning: WANDB_API_KEY environment variable is not set.")


# Define response models
class RunInfo(BaseModel):
    id: str
    name: str
    created_at: str
    url: str

class ImageInfo(BaseModel):
    url: str
    caption: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    step: int

class StepInfo(BaseModel):
    step: int
    
class MetricImageResponse(BaseModel):
    run_id: str
    run_name: str
    metric: str
    step: int
    images: List[ImageInfo]

# Initialize wandb API
try:
    wandb.login()
    api = wandb.Api()
except Exception as e:
    print(f"Error initializing wandb: {e}")
    api = None


@app.get("/", response_model=Dict[str, str])
async def root():
    return {"message": "Wandb Run Comparer API"}


@app.get("/runs", response_model=List[RunInfo])
async def list_runs(
    entity: str = Query(DEFAULT_ENTITY, description="Wandb entity name"),
    project: str = Query(DEFAULT_PROJECT, description="Wandb project name"),
    page: int = Query(1, description="Page number for pagination"),
    per_page: int = Query(DEFAULT_PAGE_SIZE, description="Items per page")
):
    if not api:
        raise HTTPException(status_code=500, detail="Wandb API not initialized")
    
    try:
        # Calculate the start and end indices for the current page
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        
        # Get all runs for the project
        runs = api.runs(path=f"{entity}/{project}", order="-created_at")
        
        # Get the subset of runs for the current page
        page_runs = runs[start_idx:end_idx]
        
        # Format the response
        result = []
        for run in page_runs:
            result.append({
                "id": run.id,
                "name": run.name,
                "created_at": run.created_at,
                "url": run.url
            })
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving runs: {str(e)}")


@app.get("/runs/{run_id}/steps", response_model=List[StepInfo])
async def get_run_image_steps(
    run_id: str,
    entity: str = Query(DEFAULT_ENTITY, description="Wandb entity name"),
    project: str = Query(DEFAULT_PROJECT, description="Wandb project name"),
    metrics: List[str] = Query(None, description="Metrics to check for images")
):
    if not api:
        raise HTTPException(status_code=500, detail="Wandb API not initialized")
    
    try:
        # If no metrics provided, use the default list
        if not metrics:
            metrics = DEFAULT_METRICS
            
        run: Run = api.run(f"{entity}/{project}/{run_id}")
        
        # Get steps using the helper function
        steps = _get_run_image_steps(run, metrics)
        return [{"step": step} for step in steps]
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving steps: {str(e)}")


@app.get("/runs/{run_id}/images", response_model=List[MetricImageResponse])
async def get_run_images(
    run_id: str,
    step: int,
    entity: str = Query(DEFAULT_ENTITY, description="Wandb entity name"),
    project: str = Query(DEFAULT_PROJECT, description="Wandb project name"),
    metrics: List[str] = Query(None, description="Metrics to retrieve images for")
):
    if not api:
        raise HTTPException(status_code=500, detail="Wandb API not initialized")
    
    try:
        # If no metrics provided, use the default list
        if not metrics:
            metrics = DEFAULT_METRICS
        
        run_endpoint = f"{entity}/{project}/{run_id}"
        run: Run = api.run(run_endpoint)
        
        result: list[MetricImageResponse] = []
        
        try:
            # Get history for this metric
            history = run.history(keys=metrics)
            
            # Check if this step exists in the history
            for i, row in history.iterrows():
                _step = row['_step']
                if _step != step:
                    continue
                
                for metric in metrics:
                    # Check if the row contains the metric and it's an image
                    if metric in row and row[metric] and isinstance(row[metric], dict) and row[metric].get("_type") in {"image-file", "images/separated"}:
                        m_dict: dict[str, Any] = row[metric]
                        if m_dict["_type"] == "image-file":
                            # # Get the file path
                            # file_path = m_dict.get("path")
                            # file_url = run.file(file_path).url
                            # caption=m_dict.get("caption"),
                            # width=m_dict.get("width"),
                            # height=m_dict.get("height"),
                            raise NotImplementedError("haven't implemented image-file yet, only images/separated")
                        
                        images: list[ImageInfo] = []
                        for fname, caption in zip(m_dict["filenames"], m_dict["captions"]):
                            caption: str | list[str]
                            # Get the URL for the image
                            file_url = reduce(urljoin, (f'{run_endpoint}/', fname), "https://api.wandb.ai/files/")
                            
                            # Create image info
                            image_info = ImageInfo(
                                url=file_url,
                                caption=str(caption),
                                width=m_dict["width"],
                                height=m_dict["height"],
                                step=step
                            )
                            images.append(image_info)
                            
                        # Create response for this metric
                        metric_response = MetricImageResponse(
                            run_id=run_id,
                            run_name=run.name,
                            metric=metric,
                            step=step,
                            images=images
                        )
                        
                        result.append(metric_response)
            else:
                print(f"No images found on step {step} for metrics {metrics} on {run_endpoint}")
                
        except Exception as e:
            print(f"Error processing metric {metric}: {e}")
        
        return result
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving images: {str(e)}")


@app.get("/metrics", response_model=List[str])
async def list_available_metrics():
    """List available metrics for images"""
    return DEFAULT_METRICS


def _get_run_image_steps(run: Run, metrics: List[str]) -> List[int]:
    """Extract steps that have images for any of the specified metrics in a run"""
    unique_steps = set()
    
    for metric in metrics:
        try:
            history = run.history(keys=[metric])
            for i, row in history.iterrows():
                # haven't seen an image-file in the wild, but have seen images/separated
                if metric in row and row[metric] and isinstance(row[metric], dict) and row[metric].get("_type") in {"image-file", "images/separated"}:
                    # Extract step from index (assuming index is step)
                    step = row['_step']
                    unique_steps.add(step)
        except Exception as e:
            print(f"Error getting history for metric {metric}: {e}")
            continue
    
    # Convert set to sorted list
    return sorted(list(unique_steps))

class RunsStepsRequest(BaseModel):
    run_ids: List[str]
    
class RunSteps(BaseModel):
    run_id: str
    steps: List[int]

@app.post("/steps", response_model=List[RunSteps])
async def get_multiple_run_image_steps(
    request: RunsStepsRequest,
    entity: str = Query(DEFAULT_ENTITY, description="Wandb entity name"),
    project: str = Query(DEFAULT_PROJECT, description="Wandb project name"),
    metrics: List[str] = Query(None, description="Metrics to check for images")
):
    """Get steps with images for multiple runs at once"""
    if not api:
        raise HTTPException(status_code=500, detail="Wandb API not initialized")
    
    try:
        # If no metrics provided, use the default list
        if not metrics:
            metrics = DEFAULT_METRICS
        
        result = []
        
        for run_id in request.run_ids:
            try:
                run: Run = api.run(f"{entity}/{project}/{run_id}")
                
                # Get steps using the helper function
                steps = _get_run_image_steps(run, metrics)
                result.append({"run_id": run_id, "steps": steps})
                
            except Exception as e:
                print(f"Error processing run {run_id}: {e}")
                # Include the run with empty steps list to maintain the run IDs order
                result.append({"run_id": run_id, "steps": []})
        
        return result
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving steps: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=7100,
        reload=False,
        # ssl_keyfile="../cert/_cert.pem",
        # ssl_certfile="../cert/_cert.pem"
    )