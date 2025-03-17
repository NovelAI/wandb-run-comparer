# Wandb Run Comparer Backend

FastAPI webserver used solely for access to the Python wandb SDK (the corresponding JS SDK is useless).  
Enables us to retrieve the URLs of images generated in our wandb imagegen training runs, and expose those via a JSON API to a frontend.

## Setup

(Optional) create and activate a virtualenv:

```bash
python3.10 -m venv venv
. ./venv/bin/activate
```

Install dependencies:

```bash
pip3 install -r requirements.txt
```

Create a file `.env` in this directory, with any environment variables you want to impose. For example:

```bash
WANDB_API_KEY=my_cool_api_key
WANDB_ENTITY=my_cool_org
WANDB_PROJECT=my_cool_project
```

## Usage

_(We assume that you have activated the virtualenv created in the previous step, if you chose to do so)._  
Run the FastAPI service like so:

```bash
python -m main
```

The API should then be reachable at:  
http://localhost:7100

## Endpoints

- list recent runs (e.g. 20 per page, ordered most recent first, paged API) within a project.
- retrieve from a run's history, given a set of metrics, any images which each metric may have associated with a given training step.
- ask for a given run, on what distinct steps have images been posted

## How it works

The core technique we use is that wandb's SDK enables us to lookup the URIs at which our images are located.  
We can deliver these URIs to the frontend.

We use SDK functionality such as these:

```python
import wandb
from wandb.apis.public.runs import Run
# note: expects WANDB_API_KEY env var to be configured when backend is launched
wandb.login()
api = wandb.Api()

entity="my_cool_org"
project="my_cool_project"

runs = api.runs(path=f'{entity}/{project}')
latest_run_id = runs[0]

# each of these metrics constitutes a list of images:
# main/reals (real captioned images from our dataset)
# main/samples (images generated according to prompts from our dataset)
# main/qualities (an image prompted at various qualities from aesthetic to non-aesthetic)
# main/benchmark_0
# main/benchmark_1
# main/benchmark_2
# main/benchmark_3
# main/benchmark_4

metric_key = "main/benchmark_4"   # for example. logged with wandb.log({"main/benchmark_4": wandb.Image(…, caption=…), ..})

# note: we retrieve images from a variety of runs within the same project, for comparison
run: Run = api.run(f"{entity}/{project}/{latest_run_id}")

run_name: str = run.name

# typically an image from the wandb API has a name like this:
# media/images/main/benchmark_4_3999_8c1cfe818d56fe4e8f7e.png
# https://api.wandb.ai/files/my_cool_org/my_cool_project/cafebaf3/media/images/main/benchmark_4_3999_8c1cfe818d56fe4e8f7e.png
# visiting this will redirect a user (including unauthenticated users) to a CDN URL such as:
# https://storage.googleapis.com/wandb-production.appspot.com/my_cool_org/my_cool_project/cafebaf3/media/images/main/benchmark_4_3999_da401fc5385feda931fa.png?and=some&k=v


for i, row in run.history(keys=[metric_key]).iterrows():
    # row = Pandas.Series with the logged data
    # rowData = dict with keys ['path', 'sha256', 'size', 'width', '_type', 'format', 'height'] if it's a file
    rowData = row[metric_key]    
    filePath = rowData["path"]
    fileType = rowData["_type"]
    # print("downloading", fileType, filePath)
    # run.file(filePath).download(exist_ok=True)
```