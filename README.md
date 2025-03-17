# Wandb Run Comparer

![Example of comparing images between runs](screenshot.png)

By Anlatan Inc. Built using the style we use at [NovelAI](https://novelai.net/).  
Accesses [Weights & Biases](https://wandb.ai/).

A full-stack web application to compare the progress of image-gen training runs by retrieving images stored in wandb and displaying them in a frontend where they can be compared.

Developed using [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview). If the code is not perfect, the explanation is that we haven't read it.

## Beware

We don't add any additional authentication of users. Anybody who can reach the backend, can access the wandb functionality exposed by the backend.

Doesn't work in Firefox; images don't load correctly.

Also, viewing images requires you to be logged into wandb, as your browser's API credentials are used to resolve the image URL.

The backend could probably be changed to retrieve images from the wandb API, find the CDN URL to which they redirect, and serve the CDN URL to the user instead of the API URL. This may solve both of the above problems.  
It would also mean that images are shown to users without requiring wandb authentication, which may or may not be desirable.

## Architecture

- Backend: Python FastAPI server that accesses the wandb API
- Frontend: React + TypeScript + Vite

## Setup

Follow the [backend README](backend/README.md) to launch the backend.  
Follow the [frontend README](frontend/README.md) to launch the frontend.

The API will be available at http://localhost:7100  
The frontend will be available at http://localhost:5173

## Features

- View and select recent runs from a specified wandb project
- Choose image metrics to compare
- Navigate through training steps with a slider
- Compare images from different runs side by side
- View detailed images by clicking on thumbnails
- Compare two images with shift+click

## Contribution

This repository is open-source but not open-contribution. Be prepared that we may not have bandwidth to review pull requests or answer issues; we develop this during spare time.  
We are interested in fixes for the Firefox bug though.

## License

[MIT](LICENSE)