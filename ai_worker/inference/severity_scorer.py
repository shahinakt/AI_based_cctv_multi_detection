# ai_worker/inference/severity_scorer.py
from typing import Dict, Any

def score_severity(event: Dict[str, Any], context: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Compute severity score (0-100) and label based on event properties.
    
    Formula: 
    severity = base_confidence * persistence_factor * actor_multiplier * criticality_weight
    
    Where:
    - base_confidence: event confidence (0-1)
    - persistence_factor: min(1.0 + duration_seconds/10, 2.0)
    - actor_multiplier: 1.0 + 0.2 * (number_of_people - 1)
    - criticality_weight: 1.0 for normal, 1.5 for falls, 2.0 for fights
    
    Returns severity score (0-100) and label (low, medium, high, critical)
    """
    base_confidence = event.get('confidence', 0.5)
    duration = context.get('duration_seconds', 1) if context else 1
    num_actors = context.get('num_actors', 1) if context else 1
    event_type = event.get('type', 'unknown')
    
    persistence_factor = min(1.0 + duration / 10.0, 2.0)
    actor_multiplier = 1.0 + 0.2 * (num_actors - 1)
    
    criticality_weights = {
        'fall': 1.5,
        'fight': 2.0,
        'intrusion': 1.8,
        'unknown': 1.0
    }
    criticality_weight = criticality_weights.get(event_type, 1.0)
    
    raw_score = base_confidence * persistence_factor * actor_multiplier * criticality_weight
    severity_score = min(int(raw_score * 50), 100)  # Scale to 0-100
    
    if severity_score < 25:
        label = 'low'
    elif severity_score < 50:
        label = 'medium'
    elif severity_score < 75:
        label = 'high'
    else:
        label = 'critical'
    
    return {
        'score': severity_score,
        'label': label,
        'components': {
            'base_confidence': base_confidence,
            'persistence_factor': persistence_factor,
            'actor_multiplier': actor_multiplier,
            'criticality_weight': criticality_weight
        }
    }