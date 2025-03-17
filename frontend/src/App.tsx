import { useState, useEffect, useRef, MouseEvent, useReducer, Suspense } from 'react'
import './App.css'

// Types for our API responses
interface RunInfo {
  id: string
  name: string
  created_at: string
  url: string
}

interface StepInfo {
  step: number
}

interface ImageInfo {
  url: string
  caption?: string
  width?: number
  height?: number
  step: number
}

interface MetricImageResponse {
  run_id: string
  run_name: string
  metric: string
  step: number
  images: ImageInfo[]
}

interface RunSteps {
  run_id: string
  steps: number[]
}

// Reducer for managing step set cache
interface StepSetState {
  byRunId: Record<string, number[]>;
  unionSteps: number[];
  loading: boolean;
}

type StepSetAction = 
  | { type: 'SET_LOADING', loading: boolean }
  | { type: 'SET_RUN_STEPS', runId: string, steps: number[] }
  | { type: 'REMOVE_RUN', runId: string }
  | { type: 'CLEAR_ALL' };

const stepSetReducer = (state: StepSetState, action: StepSetAction): StepSetState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    
    case 'SET_RUN_STEPS':
      const newByRunId = { ...state.byRunId, [action.runId]: action.steps };
      
      // Calculate union of all steps
      const allSteps = new Set<number>();
      Object.values(newByRunId).forEach(steps => {
        steps.forEach(step => allSteps.add(step));
      });
      const newUnionSteps = Array.from(allSteps).sort((a, b) => a - b);
      
      return {
        byRunId: newByRunId,
        unionSteps: newUnionSteps,
        loading: state.loading
      };
    
    case 'REMOVE_RUN':
      const updatedRunIds = { ...state.byRunId };
      delete updatedRunIds[action.runId];
      
      // Recalculate union of steps
      const remainingSteps = new Set<number>();
      Object.values(updatedRunIds).forEach(steps => {
        steps.forEach(step => remainingSteps.add(step));
      });
      const updatedUnionSteps = Array.from(remainingSteps).sort((a, b) => a - b);
      
      return {
        byRunId: updatedRunIds,
        unionSteps: updatedUnionSteps,
        loading: state.loading
      };
    
    case 'CLEAR_ALL':
      return {
        byRunId: {},
        unionSteps: [],
        loading: false
      };
    
    default:
      return state;
  }
};

const API_BASE_URL = 'http://localhost:7100'

function App() {
  const [runs, setRuns] = useState<RunInfo[]>([])
  const [selectedRuns, setSelectedRuns] = useState<string[]>([])
  const [availableMetrics, setAvailableMetrics] = useState<string[]>([])
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([])
  const [images, setImages] = useState<MetricImageResponse[]>([])
  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null)
  const [compareImage, setCompareImage] = useState<ImageInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Use reducer for managing step sets
  const [stepSetState, dispatchStepSet] = useReducer(stepSetReducer, {
    byRunId: {},
    unionSteps: [],
    loading: false
  });
  
  // Current step state
  const [currentStep, setCurrentStep] = useState<number | null>(null)
  
  // Side panel state
  const [sidePanelOpen, setSidePanelOpen] = useState(false)
  const [sidePanelWidth, setSidePanelWidth] = useState(400)
  const [isResizing, setIsResizing] = useState(false)
  const sidePanelRef = useRef<HTMLDivElement>(null)
  const resizeHandleRef = useRef<HTMLDivElement>(null)

  // Fetch runs and metrics on component mount
  useEffect(() => {
    const fetchRunsAndMetrics = async () => {
      try {
        setLoading(true)
        
        // Fetch both runs and metrics in parallel
        const [runsResponse, metricsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/runs`),
          fetch(`${API_BASE_URL}/metrics`)
        ])
        
        if (!runsResponse.ok) {
          throw new Error(`API request failed with status ${runsResponse.status}`)
        }
        
        if (!metricsResponse.ok) {
          throw new Error(`API request failed with status ${metricsResponse.status}`)
        }
        
        const runsData = await runsResponse.json()
        const metricsData = await metricsResponse.json()
        
        setRuns(runsData)
        setAvailableMetrics(metricsData)
        
        // Select first metric by default if available
        if (metricsData.length > 0) {
          setSelectedMetrics([metricsData[0]])
        }
        
        setError(null)
      } catch (err) {
        console.error('Error fetching initial data:', err)
        setError('Failed to load initial data. Please ensure the backend server is running.')
      } finally {
        setLoading(false)
      }
    }

    fetchRunsAndMetrics()
  }, [])

  // Create refs outside the hooks to avoid lint errors
  const fetchStepsRef = useRef<NodeJS.Timeout | null>(null);
  const fetchImagesRef = useRef<NodeJS.Timeout | null>(null);
  const stepSliderRef = useRef<NodeJS.Timeout | null>(null);
  
  // Fetch steps when selected runs or metrics change
  useEffect(() => {
    // Skip on initial render when no runs are selected yet
    if (selectedRuns.length === 0 || selectedMetrics.length === 0) {
      dispatchStepSet({ type: 'CLEAR_ALL' });
      return;
    }

    // Keep track of previous runs and metrics to avoid unnecessary fetches

    const fetchSteps = async () => {
      try {
        setLoading(true);
        dispatchStepSet({ type: 'SET_LOADING', loading: true });
        
        // First, get any runs that need to be removed from the step set
        const runIdsToRemove = Object.keys(stepSetState.byRunId).filter(
          runId => !selectedRuns.includes(runId)
        );
        
        // Remove runs that are no longer selected
        runIdsToRemove.forEach(runId => {
          dispatchStepSet({ type: 'REMOVE_RUN', runId });
        });
        
        // Get runs that need to be fetched
        const runsToFetch = selectedRuns.filter(
          runId => !stepSetState.byRunId[runId] || !stepSetState.byRunId[runId].length
        );
        
        if (runsToFetch.length > 0) {
          // Construct the metrics query parameter
          const metricsParam = selectedMetrics.map(m => `metrics=${encodeURIComponent(m)}`).join('&');
          
          // Call the new API endpoint to get steps for multiple runs
          const response = await fetch(`${API_BASE_URL}/steps?${metricsParam}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ run_ids: runsToFetch })
          });
          
          if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
          }
          
          const data: RunSteps[] = await response.json();
          
          // Update step sets for each run
          data.forEach(runSteps => {
            dispatchStepSet({
              type: 'SET_RUN_STEPS',
              runId: runSteps.run_id,
              steps: runSteps.steps
            });
          });
        }
        
        // Set current step to the first step if we don't have one selected or current is invalid
        if (stepSetState.unionSteps.length > 0) {
          if (currentStep === null || !stepSetState.unionSteps.includes(currentStep)) {
            setCurrentStep(stepSetState.unionSteps[0]);
          }
        }
        
        setError(null);
      } catch (err) {
        console.error('Error fetching steps:', err);
        setError('Failed to load steps from the selected runs.');
      } finally {
        setLoading(false);
        dispatchStepSet({ type: 'SET_LOADING', loading: false });
      }
    };

    // Clear any existing timeout
    if (fetchStepsRef.current) {
      clearTimeout(fetchStepsRef.current);
    }

    // Add a small debounce to prevent multiple rapid fetches
    fetchStepsRef.current = setTimeout(fetchSteps, 100);

    // Clean up timeout on unmount
    return () => {
      if (fetchStepsRef.current) {
        clearTimeout(fetchStepsRef.current);
      }
    };
  }, [selectedRuns, selectedMetrics]);
  
  // Handle run selection/deselection
  useEffect(() => {
    // When a run is deselected, remove it from the step set
    Object.keys(stepSetState.byRunId).forEach(runId => {
      if (!selectedRuns.includes(runId)) {
        dispatchStepSet({ type: 'REMOVE_RUN', runId });
      }
    });
    
    // If the current step is no longer valid after removing runs, reset it
    if (currentStep !== null && stepSetState.unionSteps.length > 0 && !stepSetState.unionSteps.includes(currentStep)) {
      setCurrentStep(stepSetState.unionSteps[0]);
    } else if (stepSetState.unionSteps.length === 0) {
      setCurrentStep(null);
    }
  }, [selectedRuns]);

  // Fetch images when selected runs, metrics, or current step changes
  useEffect(() => {
    if (selectedRuns.length === 0 || selectedMetrics.length === 0 || currentStep === null) {
      setImages([])
      return
    }

    // Use a ref to store the timeout ID for debouncing

    const fetchImages = async () => {
      try {
        setLoading(true)
        
        const fetchPromises = selectedRuns.map(async (runId) => {
          const metricsParam = selectedMetrics.map(m => `metrics=${encodeURIComponent(m)}`).join('&')
          const response = await fetch(`${API_BASE_URL}/runs/${runId}/images?step=${currentStep}&${metricsParam}`)
          
          if (!response.ok) {
            throw new Error(`API request failed with status ${response.status} for run ${runId}`)
          }
          
          return await response.json()
        })
        
        const results = await Promise.all(fetchPromises)
        // Flatten the array of arrays
        const allImages = results.flat()
        
        setImages(allImages)
        setError(null)
      } catch (err) {
        console.error('Error fetching images:', err)
        setError('Failed to load images for the selected runs and step.')
        setImages([])
      } finally {
        setLoading(false)
      }
    }

    // Clear any existing timeout
    if (fetchImagesRef.current) {
      clearTimeout(fetchImagesRef.current)
    }

    // Add a small debounce to prevent multiple rapid fetches
    fetchImagesRef.current = setTimeout(fetchImages, 100)

    // Clean up timeout on unmount
    return () => {
      if (fetchImagesRef.current) {
        clearTimeout(fetchImagesRef.current)
      }
      
      // Also clear step slider timeout if it exists
      if (stepSliderRef.current) {
        clearTimeout(stepSliderRef.current)
      }
    }
  }, [selectedRuns, selectedMetrics, currentStep])

  // Handle resizing of side panel
  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!isResizing) return
      
      const newWidth = window.innerWidth - e.clientX
      if (newWidth > 200 && newWidth < window.innerWidth * 0.6) {
        setSidePanelWidth(newWidth)
      }
    }
    
    const handleMouseUp = () => {
      setIsResizing(false)
    }
    
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  const handleRunSelection = (runId: string) => {
    setSelectedRuns(prevSelected => {
      if (prevSelected.includes(runId)) {
        return prevSelected.filter(id => id !== runId)
      } else {
        return [...prevSelected, runId]
      }
    })
  }

  const handleMetricSelection = (metric: string) => {
    setSelectedMetrics(prevSelected => {
      if (prevSelected.includes(metric)) {
        return prevSelected.filter(m => m !== metric)
      } else {
        return [...prevSelected, metric]
      }
    })
  }

  const handleStepChange = (step: number) => {
    setCurrentStep(step)
  }
  
  const refreshStepSets = async () => {
    if (selectedRuns.length === 0 || selectedMetrics.length === 0) {
      return;
    }
    
    try {
      setLoading(true);
      dispatchStepSet({ type: 'SET_LOADING', loading: true });
      
      // Force refresh all selected runs
      const metricsParam = selectedMetrics.map(m => `metrics=${encodeURIComponent(m)}`).join('&');
      
      const response = await fetch(`${API_BASE_URL}/steps?${metricsParam}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ run_ids: selectedRuns })
      });
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data: RunSteps[] = await response.json();
      
      // Update step sets for each run
      data.forEach(runSteps => {
        dispatchStepSet({
          type: 'SET_RUN_STEPS',
          runId: runSteps.run_id,
          steps: runSteps.steps
        });
      });
      
      // Check if current step is still valid
      if (currentStep !== null && !stepSetState.unionSteps.includes(currentStep) && stepSetState.unionSteps.length > 0) {
        setCurrentStep(stepSetState.unionSteps[0]);
      }
      
      setError(null);
    } catch (err) {
      console.error('Error refreshing step sets:', err);
      setError('Failed to refresh step sets.');
    } finally {
      setLoading(false);
      dispatchStepSet({ type: 'SET_LOADING', loading: false });
    }
  }

  const handleImageClick = (image: ImageInfo, isShiftClick: boolean) => {
    if (isShiftClick) {
      setCompareImage(image)
    } else {
      setSelectedImage(image)
      setCompareImage(null)
    }
    setSidePanelOpen(true)
  }

  const handleResizeStart = () => {
    setIsResizing(true)
  }

  const toggleSidePanel = () => {
    setSidePanelOpen(prev => !prev)
  }

  const clearPanel = () => {
    setSelectedImage(null)
    setCompareImage(null)
    setSidePanelOpen(false)
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Wandb Run Comparer</h1>
      </header>

      <div className="main-container">
        {/* Left Column - Controls */}
        <div className="controls-panel">
          <section className="runs-selection">
            <h2>Runs</h2>
            {loading && runs.length === 0 ? (
              <p>Loading runs...</p>
            ) : (
              <div className="run-list">
                {runs.map(run => (
                  <div key={run.id} className="run-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedRuns.includes(run.id)}
                        onChange={() => handleRunSelection(run.id)}
                      />
                      {run.name}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="metrics-selection">
            <h2>Metrics</h2>
            <div className="metric-list">
              {availableMetrics.map(metric => (
                <div key={metric} className="metric-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedMetrics.includes(metric)}
                      onChange={() => handleMetricSelection(metric)}
                    />
                    {metric}
                  </label>
                </div>
              ))}
            </div>
          </section>

          <section className="step-selection">
            <div className="step-header">
              <h2>Step</h2>
              <button 
                className="refresh-button" 
                onClick={refreshStepSets}
                disabled={selectedRuns.length === 0 || stepSetState.loading}
                title="Refresh step data from all selected runs"
              >
                ↻
              </button>
            </div>
            
            <Suspense fallback={<div>Loading steps...</div>}>
              {stepSetState.unionSteps.length > 0 ? (
                <>
                  <div className="slider-container">
                    <input
                      type="range"
                      min={Math.min(...stepSetState.unionSteps)}
                      max={Math.max(...stepSetState.unionSteps)}
                      value={currentStep || Math.min(...stepSetState.unionSteps)}
                      onChange={(e) => {
                        // Clear any existing timeout
                        if (stepSliderRef.current) {
                          clearTimeout(stepSliderRef.current);
                        }
                        
                        // No debounce for slider to make it responsive
                        const inputValue = Number(e.target.value);
                        const closestStep = stepSetState.unionSteps.reduce((prev, curr) => {
                          return Math.abs(curr - inputValue) < Math.abs(prev - inputValue) ? curr : prev;
                        });
                        handleStepChange(closestStep);
                      }}
                      disabled={stepSetState.unionSteps.length === 0 || stepSetState.loading}
                      list="step-marks"
                    />
                    <datalist id="step-marks">
                      {stepSetState.unionSteps.map(step => (
                        <option key={step} value={step}></option>
                      ))}
                    </datalist>
                  </div>
                  
                  <div className="step-input-group">
                    <input
                      type="number"
                      value={currentStep || ''}
                      onChange={(e) => {
                        // Clear any existing timeout
                        if (stepSliderRef.current) {
                          clearTimeout(stepSliderRef.current);
                        }
                        
                        // Add a small debounce to prevent multiple rapid updates
                        stepSliderRef.current = setTimeout(() => {
                          const val = Number(e.target.value);
                          // Find closest valid step
                          const closestStep = stepSetState.unionSteps.reduce((prev, curr) => {
                            return Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev;
                          }, stepSetState.unionSteps[0]);
                          handleStepChange(closestStep);
                        }, 0);
                      }}
                      min={Math.min(...stepSetState.unionSteps)}
                      max={Math.max(...stepSetState.unionSteps)}
                      disabled={stepSetState.loading}
                    />
                    <select 
                      value={currentStep || ''}
                      onChange={(e) => handleStepChange(Number(e.target.value))}
                      disabled={stepSetState.loading}
                    >
                      {stepSetState.unionSteps.map(step => (
                        <option key={step} value={step}>
                          {step}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="step-info">
                    {stepSetState.loading ? (
                      <span className="loading-steps">Loading steps...</span>
                    ) : (
                      <>
                        <div>Current step: {currentStep}</div>
                        <div className="step-availability">
                          {selectedRuns.map(runId => {
                            const runInfo = runs.find(r => r.id === runId);
                            const hasStep = stepSetState.byRunId[runId]?.includes(currentStep || 0);
                            return (
                              <div key={runId} className={`run-step-status ${hasStep ? 'has-step' : 'no-step'}`}>
                                <span title={`Run ${runInfo?.name || runId}`}>
                                  {hasStep ? '✓' : '✗'} {runInfo?.name || runId}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <p>
                  {stepSetState.loading 
                    ? "Loading steps..." 
                    : "No steps available. Please select runs and metrics."}
                </p>
              )}
            </Suspense>
          </section>
        </div>

        {/* Right Column - Content */}
        <div className="content-area">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {loading && (
            <div className="loading">
              <div className="loading-spinner"></div>
            </div>
          )}

          <div className="image-comparison">
            {images.length > 0 ? (
              <div className="metric-sections">
                {selectedMetrics.map(metric => {
                  // Filter images for this metric
                  const metricImages = images.filter(img => img.metric === metric)
                  
                  if (metricImages.length === 0) {
                    return null
                  }
                  
                  return (
                    <div key={metric} className="metric-section">
                      <h3>{metric}</h3>
                      <div className="run-images-grid">
                        {selectedRuns.map(runId => {
                          const runImages = metricImages.filter(img => img.run_id === runId)
                          const runInfo = runs.find(r => r.id === runId)
                          
                          return (
                            <div key={runId} className="run-row">
                              <h4>{runInfo?.name || runId}</h4>
                              <div className="images-row">
                                {runImages.length > 0 ? (
                                  runImages.flatMap((imgResponse, respIx) => 
                                    imgResponse.images.map((img, idx) => (
                                      <div 
                                        key={`${runId}-${metric}-${respIx}-${idx}`} 
                                        className={`thumbnail ${selectedImage === img ? 'selected' : ''} ${compareImage === img ? 'compared' : ''}`}
                                        onClick={(e: MouseEvent<HTMLDivElement>) => handleImageClick(img, e.shiftKey)}
                                      >
                                        <img src={img.url} alt={img.caption || `Image at step ${img.step}`} title={img.caption} />
                                      </div>
                                    ))
                                  )
                                ) : (
                                  <div className="no-images">No images for this run/metric/step</div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              !loading && (
                <div className="no-data">
                  <p>No images to display. Please select at least one run, one metric, and a step.</p>
                </div>
              )
            )}
          </div>
        </div>

        {/* Floating Side Panel for Image Inspection */}
        <div 
          ref={sidePanelRef}
          className={`side-panel ${sidePanelOpen ? 'side-panel-visible' : 'side-panel-collapsed'} ${isResizing ? 'resizing' : ''}`}
          style={{ width: sidePanelWidth }}
        >
          <div 
            ref={resizeHandleRef}
            className={`resize-handle ${isResizing ? 'resizing' : ''}`}
            onMouseDown={handleResizeStart}
          ></div>
          
          <div 
            className="side-panel-tab"
            onClick={toggleSidePanel}
          >
            Image Viewer
          </div>

          <div className="side-panel-content">
            <div className="side-panel-header">
              <h2>Image Details</h2>
              <button className="close-panel" onClick={clearPanel}>×</button>
            </div>

            <div className="side-panel-images">
              {selectedImage && (
                <div className="panel-image">
                  <h4>{selectedImage.caption || 'Selected Image'}</h4>
                  <div className="panel-image-container">
                    <a href={selectedImage.url} target="_blank" rel="noopener noreferrer">
                      <img src={selectedImage.url} alt={selectedImage.caption || 'Selected image'} title={selectedImage.caption} />
                    </a>
                  </div>
                </div>
              )}
              
              {compareImage && (
                <div className="panel-image">
                  <h4>{compareImage.caption || 'Comparison Image'}</h4>
                  <div className="panel-image-container">
                    <a href={compareImage.url} target="_blank" rel="noopener noreferrer">
                      <img src={compareImage.url} alt={compareImage.caption || 'Comparison image'} title={compareImage.caption} />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App