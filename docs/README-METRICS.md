# Metrics (Approx)

## Signaling (P2P media)

| Profile | vCPU |   RAM |        Users |       Pairs |
| ------- | ---: | ----: | -----------: | ----------: |
| Small   |    2 |  4 GB |      300-800 |     150-400 |
| Medium  |    4 |  8 GB |  1,000-2,500 |   500-1,250 |
| Large   |    8 | 16 GB |  3,000-6,000 | 1,500-3,000 |
| XL      |   16 | 32 GB | 7,000-15,000 | 3,500-7,500 |

## TURN relay (720p mix)

| TURN egress | Relayed users |
| ----------: | ------------: |
|    100 Mbps |        ~20-60 |
|    500 Mbps |      ~100-300 |
|      1 Gbps |      ~200-600 |

## Start sizes

| Stage  | Infra                                          |
| ------ | ---------------------------------------------- |
| MVP    | 4 vCPU, 8 GB + separate TURN                   |
| Growth | 8 vCPU, 16 GB + LB + Redis adapter             |
| Scale  | Multi-node signaling + Redis + autoscaled TURN |

Monitor: CPU, RAM, event-loop lag, disconnect spikes, TURN throughput.
