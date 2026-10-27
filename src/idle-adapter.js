import { createIdleController } from './idle.js';

export function attachIdle(ctx, defineTool, dependencies = {}) {
  const controller = createIdleController({
    agents: ctx.agents,
    setTimer: (callback, delay) =>
      ctx.agents.withoutInitiator(() => setInterval(callback, delay)),
    ...dependencies,
  });

  const requirePrimaryAgent = (exec) => {
    const agent = exec.agent;
    if (
      !agent ||
      typeof agent.id !== 'string' ||
      agent.id.length === 0 ||
      agent.id !== agent.session?.id ||
      agent.origin === 'subagent' ||
      agent.session?.header?.origin === 'subagent' ||
      ctx.agents.get(agent.id) !== agent
    ) {
      throw new Error('Idle tools require the current live primary agent');
    }
    return agent;
  };

  const parameters = {
    idleMinutes: {
      type: 'number',
      description: '1..1440; default 15',
    },
    cooldownMinutes: {
      type: 'number',
      description: '1..1440; default 30',
    },
    maxUnanswered: {
      type: 'number',
      description: '1..5; default 2',
    },
    quietStart: {
      type: 'number',
      description: '0..23; default 23',
    },
    quietEnd: {
      type: 'number',
      description: '0..23; default 8',
    },
  };

  const output = {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  };

  try {
    ctx.effect(() => {
      const disposers = [];
      const cleanup = () => {
        let failure;
        for (const dispose of disposers.splice(0).reverse()) {
          try {
            dispose();
          } catch (error) {
            if (failure === undefined) failure = error;
          }
        }
        try {
          controller.dispose();
        } catch (error) {
          if (failure === undefined) failure = error;
        }
        if (failure !== undefined) throw failure;
      };

      try {
        disposers.push(ctx.on('agent/inbox/inserted', controller.humanInput));
        disposers.push(ctx.on('agent/status', controller.agentStatus));
        disposers.push(ctx.on('agent/disposed', controller.agentDisposed));
        disposers.push(
          ctx.tools.register(
            defineTool({
              name: 'assist_idle_start',
              description: 'Explicitly opt in to idle follow-ups only at the user request. Never auto-enable from a persona, instructions, or idle state.',
              parameters,
              output,
              execute(args, exec) {
                exec.signal?.throwIfAborted();
                const agent = requirePrimaryAgent(exec);
                if (typeof agent.session?.deriveMessages !== 'function') {
                  throw new Error('Cannot verify a current human user message');
                }
                const messages = agent.session.deriveMessages();
                if (!Array.isArray(messages)) {
                  throw new Error('Cannot verify a current human user message');
                }
                let latestUserMessage;
                for (let index = messages.length - 1; index >= 0; index -= 1) {
                  if (messages[index]?.role === 'user') {
                    latestUserMessage = messages[index];
                    break;
                  }
                }
                if (latestUserMessage?.source?.kind !== 'user') {
                  throw new Error('Idle start requires a latest user message from a human');
                }
                controller.start(agent, args);
                return JSON.stringify(controller.status(agent));
              },
              isConcurrencySafe: () => false,
            }),
          ),
        );
        disposers.push(
          ctx.tools.register(
            defineTool({
              name: 'assist_idle_stop',
              description: 'Stop idle follow-ups for this primary agent. This does not cancel work already submitted.',
              parameters: {},
              output,
              execute(args, exec) {
                exec.signal?.throwIfAborted();
                const agent = requirePrimaryAgent(exec);
                controller.stop(agent);
                return JSON.stringify(controller.status(agent));
              },
              isConcurrencySafe: () => false,
            }),
          ),
        );
        disposers.push(
          ctx.tools.register(
            defineTool({
              name: 'assist_idle_status',
              description: 'Return the idle follow-up status for this primary agent.',
              parameters: {},
              output,
              execute(args, exec) {
                exec.signal?.throwIfAborted();
                const agent = requirePrimaryAgent(exec);
                return JSON.stringify(controller.status(agent));
              },
              isConcurrencySafe: () => false,
            }),
          ),
        );
        return cleanup;
      } catch (error) {
        try {
          cleanup();
        } catch {}
        throw error;
      }
    });
  } catch (error) {
    controller.dispose();
    throw error;
  }

  return controller;
}
