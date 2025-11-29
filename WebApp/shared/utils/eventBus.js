/**
 * Simple Event Bus for cross-component communication
 * Used for stock updates, shipment changes, etc.
 */

class EventBus {
  constructor() {
    this.events = {};
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);

    // Return unsubscribe function
    return () => {
      this.events[event] = this.events[event].filter(cb => cb !== callback);
    };
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners for an event
   * @param {string} event - Event name
   */
  off(event) {
    delete this.events[event];
  }
}

// Singleton instance
const eventBus = new EventBus();

// Event names constants
export const EVENTS = {
  STOCK_UPDATED: 'stock:updated',
  SHIPMENT_CREATED: 'shipment:created',
  SHIPMENT_UPDATED: 'shipment:updated',
  SHIPMENT_ITEM_ADDED: 'shipment:item:added',
  SHIPMENT_ITEM_REMOVED: 'shipment:item:removed',
  MATERIAL_UPDATED: 'material:updated',
  ORDER_UPDATED: 'order:updated'
};

export default eventBus;
