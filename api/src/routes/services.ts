import { FastifyPluginAsync } from 'fastify';
import { keccak256, toUtf8Bytes } from 'ethers';

// Service types matching on-chain hashes
export type ServiceType = 'inspection' | 'security_patrol' | 'delivery';

export const SERVICE_TYPE_HASHES: Record<ServiceType, string> = {
  inspection: keccak256(toUtf8Bytes('inspection')),
  security_patrol: keccak256(toUtf8Bytes('security_patrol')),
  delivery: keccak256(toUtf8Bytes('delivery')),
};

interface ServiceDefinition {
  id: ServiceType;
  label: string;
  requiredCapabilities: string[];
  specSchemaRef: string;
  manifestSchemaRef: string;
  baseRateUsd: number;
  description: string;
}

// Service registry
const SERVICE_REGISTRY: ServiceDefinition[] = [
  {
    id: 'inspection',
    label: 'Facility Inspection',
    requiredCapabilities: ['navigation', 'camera', 'thermal_optional'],
    specSchemaRef: 'schemas/JobSpec.schema.json#/properties/serviceParams/inspection',
    manifestSchemaRef: 'schemas/ExecutionManifest.schema.json#/properties/inspection',
    baseRateUsd: 100,
    description: 'Autonomous facility inspection with coverage tracking and artifact collection',
  },
  {
    id: 'security_patrol',
    label: 'Security Patrol',
    requiredCapabilities: ['navigation', 'camera', 'anomaly_detection'],
    specSchemaRef: 'schemas/JobSpec.schema.json#/properties/serviceParams/patrol',
    manifestSchemaRef: 'schemas/ExecutionManifest.schema.json#/properties/patrol',
    baseRateUsd: 150,
    description: 'Scheduled patrol with checkpoint verification and dwell time compliance',
  },
  {
    id: 'delivery',
    label: 'Autonomous Delivery',
    requiredCapabilities: ['navigation', 'cargo_secure', 'pickup_dropoff'],
    specSchemaRef: 'schemas/JobSpec.schema.json#/properties/serviceParams/delivery',
    manifestSchemaRef: 'schemas/ExecutionManifest.schema.json#/properties/delivery',
    baseRateUsd: 200,
    description: 'Point-to-point delivery with pickup and dropoff proof verification',
  },
];

// Sample offer templates per service
const OFFER_TEMPLATES: Record<ServiceType, Array<{ description: string; suggestedPrice: number; workUnits: number }>> = {
  inspection: [
    { description: 'Small warehouse inspection (< 500 sqm)', suggestedPrice: 100, workUnits: 3 },
    { description: 'Medium warehouse inspection (500-2000 sqm)', suggestedPrice: 200, workUnits: 5 },
    { description: 'Large warehouse inspection (> 2000 sqm)', suggestedPrice: 350, workUnits: 8 },
    { description: 'Solar panel array inspection', suggestedPrice: 150, workUnits: 4 },
    { description: 'HVAC system inspection', suggestedPrice: 120, workUnits: 3 },
  ],
  security_patrol: [
    { description: 'Single-floor office patrol', suggestedPrice: 100, workUnits: 4 },
    { description: 'Multi-floor building patrol', suggestedPrice: 250, workUnits: 8 },
    { description: 'Outdoor perimeter patrol', suggestedPrice: 180, workUnits: 6 },
    { description: 'Parking structure patrol', suggestedPrice: 150, workUnits: 5 },
    { description: 'Night security patrol (premium)', suggestedPrice: 300, workUnits: 8 },
  ],
  delivery: [
    { description: 'Short-range delivery (< 1 km)', suggestedPrice: 50, workUnits: 1 },
    { description: 'Medium-range delivery (1-5 km)', suggestedPrice: 120, workUnits: 1 },
    { description: 'Long-range delivery (> 5 km)', suggestedPrice: 200, workUnits: 1 },
    { description: 'Express delivery (priority)', suggestedPrice: 180, workUnits: 1 },
    { description: 'Fragile goods delivery', suggestedPrice: 250, workUnits: 1 },
  ],
};

export const servicesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /services - List all available services
  fastify.get('/', async () => {
    return {
      services: SERVICE_REGISTRY.map((service) => ({
        id: service.id,
        label: service.label,
        serviceTypeHash: SERVICE_TYPE_HASHES[service.id],
        requiredCapabilities: service.requiredCapabilities,
        baseRateUsd: service.baseRateUsd,
        description: service.description,
      })),
      total: SERVICE_REGISTRY.length,
    };
  });

  // GET /services/:id - Get service details
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const serviceId = request.params.id as ServiceType;
    const service = SERVICE_REGISTRY.find((s) => s.id === serviceId);

    if (!service) {
      return reply.status(404).send({ error: 'Service not found' });
    }

    return {
      id: service.id,
      label: service.label,
      serviceTypeHash: SERVICE_TYPE_HASHES[service.id],
      requiredCapabilities: service.requiredCapabilities,
      specSchemaRef: service.specSchemaRef,
      manifestSchemaRef: service.manifestSchemaRef,
      baseRateUsd: service.baseRateUsd,
      description: service.description,
    };
  });

  // GET /services/:id/schema - Get service spec requirements
  fastify.get<{ Params: { id: string } }>('/:id/schema', async (request, reply) => {
    const serviceId = request.params.id as ServiceType;
    const service = SERVICE_REGISTRY.find((s) => s.id === serviceId);

    if (!service) {
      return reply.status(404).send({ error: 'Service not found' });
    }

    // Return schema references and field requirements
    const schemaInfo: Record<ServiceType, object> = {
      inspection: {
        requiredFields: ['waypoints', 'coverageTargetPercent'],
        optionalFields: ['thermalEnabled', 'artifactTypes'],
        workUnitsFormula: 'coverageVisited + artifacts.length',
        qualityFormula: '(coverageVisited/coverageTotal * 80) + (hasArtifacts ? 20 : 0)',
      },
      security_patrol: {
        requiredFields: ['checkpoints', 'expectedDwellSeconds'],
        optionalFields: ['patrolSchedule', 'alertThreshold'],
        workUnitsFormula: 'checkpointsVisited.length',
        qualityFormula: '(checkpointsVisited/expected * 70) + (dwellCompliance * 30)',
      },
      delivery: {
        requiredFields: ['pickupLocation', 'dropoffLocation', 'expectedDurationMinutes'],
        optionalFields: ['fragile', 'temperatureControlled', 'signature_required'],
        workUnitsFormula: '1 (per delivery)',
        qualityFormula: 'pickupProof(40) + dropoffProof(40) + route(10) + timing(10)',
      },
    };

    return {
      id: service.id,
      specSchemaRef: service.specSchemaRef,
      manifestSchemaRef: service.manifestSchemaRef,
      ...schemaInfo[serviceId],
    };
  });

  // GET /services/:id/templates - Get offer templates
  fastify.get<{ Params: { id: string } }>('/:id/templates', async (request, reply) => {
    const serviceId = request.params.id as ServiceType;
    const service = SERVICE_REGISTRY.find((s) => s.id === serviceId);

    if (!service) {
      return reply.status(404).send({ error: 'Service not found' });
    }

    const templates = OFFER_TEMPLATES[serviceId] || [];

    return {
      serviceType: serviceId,
      serviceTypeHash: SERVICE_TYPE_HASHES[serviceId],
      templates: templates.map((t, i) => ({
        templateId: i + 1,
        description: t.description,
        suggestedPriceUsd: t.suggestedPrice,
        estimatedWorkUnits: t.workUnits,
        suggestedPriceWei: (BigInt(t.suggestedPrice) * BigInt(10 ** 18)).toString(),
      })),
    };
  });

  // GET /services/hash/:hash - Lookup service by hash
  fastify.get<{ Params: { hash: string } }>('/hash/:hash', async (request, reply) => {
    const hash = request.params.hash.toLowerCase();
    const serviceId = Object.entries(SERVICE_TYPE_HASHES).find(
      ([_, h]) => h.toLowerCase() === hash
    )?.[0] as ServiceType | undefined;

    if (!serviceId) {
      return reply.status(404).send({ error: 'Service not found for hash' });
    }

    const service = SERVICE_REGISTRY.find((s) => s.id === serviceId)!;
    return {
      id: service.id,
      label: service.label,
      serviceTypeHash: SERVICE_TYPE_HASHES[serviceId],
    };
  });
};

// Export for use in other modules
export function getServiceTypeHash(serviceType: ServiceType): string {
  return SERVICE_TYPE_HASHES[serviceType];
}

export function isValidServiceType(type: string): type is ServiceType {
  return ['inspection', 'security_patrol', 'delivery'].includes(type);
}

export function getServiceBaseRate(serviceType: ServiceType): number {
  const service = SERVICE_REGISTRY.find((s) => s.id === serviceType);
  return service?.baseRateUsd || 100;
}
