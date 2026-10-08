// Lua scripts run atomically on the Redis server. Key prefixes are passed as arguments because
// partner keys are only known inside the script.

// Pops the oldest waiting socket other than the caller and the optional excluded socket (ARGV[3]).
// When nobody eligible is waiting the caller is queued instead, all in one atomic step so two
// instances cannot both queue each other and wait forever.
const CLAIM_OR_ENQUEUE_SCRIPT = `
redis.call('LREM', KEYS[1], 0, ARGV[1])
local waiting = redis.call('LRANGE', KEYS[1], 0, -1)
for _, candidate in ipairs(waiting) do
    if candidate ~= ARGV[3] then
        redis.call('LREM', KEYS[1], 1, candidate)
        return {'claimed', candidate}
    end
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

// Adds a reporter and returns how many different reporters there are. The window starts at the first report.
const ADD_REPORT_SCRIPT = `
redis.call('SADD', KEYS[1], ARGV[1])
if redis.call('TTL', KEYS[1]) < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return redis.call('SCARD', KEYS[1])
`;

const INCREMENT_STRIKES_SCRIPT = `
local strikes = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1])
return strikes
`;

// Reads and deletes in one step so concurrent reports cannot both use the same record.
const TAKE_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if value then
    redis.call('DEL', KEYS[1])
end
return value
`;

module.exports = {
    ADD_REPORT_SCRIPT,
    INCREMENT_STRIKES_SCRIPT,
    TAKE_SCRIPT,
    CLAIM_OR_ENQUEUE_SCRIPT,
    PAIR_SCRIPT,
    UNPAIR_SCRIPT,
};
