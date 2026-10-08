// Lua scripts run atomically on the Redis server. Key prefixes are passed as arguments because
// partner keys are only known inside the script.

// Pops the oldest waiting socket other than the caller. When nobody is waiting the caller is queued
// instead, all in one atomic step so two instances cannot both queue each other and wait forever.
const CLAIM_OR_ENQUEUE_SCRIPT = `
redis.call('LREM', KEYS[1], 0, ARGV[1])
local candidate = redis.call('LPOP', KEYS[1])
if candidate then
    return {'claimed', candidate}
end
local max = tonumber(ARGV[2])
if max > 0 and redis.call('LLEN', KEYS[1]) >= max then
    return {'full', ''}
end
return {'queued', tostring(redis.call('RPUSH', KEYS[1], ARGV[1]))}
`;

const PAIR_SCRIPT = `
redis.call('SET', ARGV[1] .. ARGV[2], ARGV[3], 'EX', ARGV[4])
redis.call('SET', ARGV[1] .. ARGV[3], ARGV[2], 'EX', ARGV[4])
return 1
`;

// Atomically removes both directions of a pair so concurrent unpair calls cannot both succeed.
const UNPAIR_SCRIPT = `
local partner = redis.call('GET', ARGV[1] .. ARGV[2])
if not partner then
    return false
end
redis.call('DEL', ARGV[1] .. ARGV[2])
if redis.call('GET', ARGV[1] .. partner) == ARGV[2] then
    redis.call('DEL', ARGV[1] .. partner)
end
return partner
`;

module.exports = {
    CLAIM_OR_ENQUEUE_SCRIPT,
    PAIR_SCRIPT,
    UNPAIR_SCRIPT,
};
