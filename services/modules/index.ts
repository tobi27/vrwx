/**
 * Service Modules Registry
 *
 * Provides access to all service modules and utility functions.
 */

import type { IServiceModule } from './IServiceModule';
import type { ServiceType, ServiceDefinition } from '../../sdk/src/types';
import { InspectionModule } from './InspectionModule';
import { SecurityPatrolModule } from './SecurityPatrolModule';
import { DeliveryModule } from './DeliveryModule';

// Export interfaces and base class
export { IServiceModule, BaseServiceModule } from './IServiceModule';

// Export concrete modules
export { InspectionModule } from './InspectionModule';
export { SecurityPatrolModule } from './SecurityPatrolModule';
export { DeliveryModule } from './DeliveryModule';

// Instantiate modules
const inspectionModule = new InspectionModule();
const securityPatrolModule = new SecurityPatrolModule();
const deliveryModule = new DeliveryModule();

// Module registry
const moduleRegistry: Map<ServiceType, IServiceModule> = new Map([
  ['inspection', inspectionModule],
  ['security_patrol', securityPatrolModule],
  ['delivery', deliveryModule],
]);

/**
 * Get a service module by service type
 */
export function getModule(serviceType: ServiceType): IServiceModule {
  const module = moduleRegistry.get(serviceType);
  if (!module) {
    throw new Error(`Unknown service type: ${serviceType}`);
  }
  return module;
}

/**
 * Check if a service type is supported
 */
export function isServiceTypeSupported(serviceType: string): serviceType is ServiceType {
  return moduleRegistry.has(serviceType as ServiceType);
}

/**
 * Get all supported service types
 */
export function getSupportedServiceTypes(): ServiceType[] {
  return Array.from(moduleRegistry.keys());
}

/**
 * Get service definitions for all services
 */
export function getServiceDefinitions(): ServiceDefinition[] {
  return Array.from(moduleRegistry.values()).map(module => ({
    id: module.id(),
    label: module.label(),
    description: module.description(),
    requiredCapabilities: module.requiredCapabilities(),
    baseRateUsd: module.baseRateUsd(),
  }));
}

/**
 * Get service definition by ID
 */
export function getServiceDefinition(serviceType: ServiceType): ServiceDefinition | undefined {
  const module = moduleRegistry.get(serviceType);
  if (!module) return undefined;

  return {
    id: module.id(),
    label: module.label(),
    description: module.description(),
    requiredCapabilities: module.requiredCapabilities(),
    baseRateUsd: module.baseRateUsd(),
  };
}

/**
 * Register a custom service module
 */
export function registerModule(module: IServiceModule): void {
  moduleRegistry.set(module.id(), module);
}

// Service type hash constants (keccak256 of service type strings)
// These are pre-computed for gas efficiency
import { keccak256, toUtf8Bytes } from 'ethers';

export const SERVICE_TYPE_HASHES: Record<ServiceType, string> = {
  inspection: keccak256(toUtf8Bytes('inspection')),
  security_patrol: keccak256(toUtf8Bytes('security_patrol')),
  delivery: keccak256(toUtf8Bytes('delivery')),
};

/**
 * Get the service type hash for a given service type
 */
export function getServiceTypeHash(serviceType: ServiceType): string {
  const hash = SERVICE_TYPE_HASHES[serviceType];
  if (!hash) {
    throw new Error(`Unknown service type: ${serviceType}`);
  }
  return hash;
}

/**
 * Get the service type from a hash
 */
export function getServiceTypeFromHash(hash: string): ServiceType | undefined {
  for (const [serviceType, typeHash] of Object.entries(SERVICE_TYPE_HASHES)) {
    if (typeHash.toLowerCase() === hash.toLowerCase()) {
      return serviceType as ServiceType;
    }
  }
  return undefined;
}
