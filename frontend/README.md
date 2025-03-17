# Wandb Run Comparer Frontend

The purpose is to compare the progress of imagegen training runs, by retrieving from the backend the images stored by wandb.

Frontend made using Vite + React + Typescript (swc), via `npm create vite`.

_Note: the below specification was mostly for Claude's benefit, and has now been implemented._

This will issue HTTP JSON requests to the backend running on:  
http://localhost:7100

It will ask the backend "what runs occurred recently in project (default=my_cool_project)?"  
You'll see the friendly name of each such run.  
You'll be able to use checkboxes to determine which runs you wish to compare.

You'll be able to specify which metrics you wish to include in the comparison, typically:

```
main/samples
main/qualities
main/benchmark_0
main/benchmark_1
main/benchmark_2
main/benchmark_3
main/benchmark_4
```

You'll specify the step for which you wish to compare image outputs of your checked runs.

For each metric, there'd be a section on the page, we'd line up the strips of images contributed for that metric on that step by each run.  
Some runs wouldn't have images for that metric on that step, indicate that clearly.  
The true size of images is large (i.e. a megapixel), but we want comparison to be easy. So we should display the images at thumbnail size (full-quality just presented with small dimensions), so that we can compare a strip of images from one run to another run beneath it.

A side-panel (i.e. floating to the right of the main area in which strips of image thumbnails are compared) will be available for presenting images at larger size.  
The side-panel will be collapsible, and also click-and-drag expandable. It would be floating, so dragging it will not reflow other content beneath it.
Clicking on an image thumbnail would make the full-size image appear in the panel.  
The panel would have slots for two images, but would only allocate space for both when both slots are being utilized.  
Clicking an image puts it in the panel's left image slot, and clears the right image slot if occupied.  
Shift-clicking an image puts the image in the panel's right image slot, allowing a side-by-side comparison.  
The images attempt to fill the space available in the panel, but grow no larger than their native dimensions.  
Left-clicking either image in the panel opens the image in a new tab, to allow for seeing it at full-resolution (i.e. for cases like when there is insufficient space in the panel to show it at full size).

There'll be a slider with notches, for you to progress through time, to any training step where any of the runs has posted an image on any of the metrics. Should you prefer to type in the step number, a numeric input will also be available alongside the slider.

No authentication is required to connect to our backend.

## Setup

Developed with NodeJS 23, but may work with older NodeJS.  
_You could consider using [nvm](https://github.com/nvm-sh/nvm) to juggle NodeJS versions._

Install dependencies:

```bash
npm i
```

## Usage

```bash
npm run dev
```

Visit:  
http://localhost:5173