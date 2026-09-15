import {describe,expect,it} from 'vitest';
import {creativeRegistry} from '../creative-registry';
import {echoSamples,posterizeSampleTime} from '../temporal-effects';

describe('temporal effect planning',()=>{
  it('quantizes posterize time to the previous frame boundary',()=>{
    expect(posterizeSampleTime(0,10)).toBe(0);
    expect(posterizeSampleTime(99,10)).toBe(0);
    expect(posterizeSampleTime(100,10)).toBe(100);
    expect(posterizeSampleTime(101,10)).toBe(100);
    expect(posterizeSampleTime(999,60)).toBeCloseTo(983.3333333333334);
  });

  it('never returns negative posterize sample times and clamps invalid fps',()=>{
    expect(posterizeSampleTime(-50,12)).toBe(0);
    expect(posterizeSampleTime(500,0)).toBe(0);
    expect(posterizeSampleTime(500,999)).toBeCloseTo(500);
  });

  it('returns deterministic echo samples with geometric decay',()=>{
    expect(echoSamples(1000,100,3,.5,'export')).toEqual([
      {timeMs:900,alpha:.5},
      {timeMs:800,alpha:.25},
      {timeMs:700,alpha:.125},
    ]);
    expect(echoSamples(1000,100,3,.5,'export')).toEqual(echoSamples(1000,100,3,.5,'export'));
  });

  it('drops negative history samples and caps trail count by preview quality',()=>{
    expect(echoSamples(150,100,12,.8,'export')).toEqual([{timeMs:50,alpha:.8}]);
    expect(echoSamples(2000,100,12,.8,'preview-low')).toHaveLength(3);
    expect(echoSamples(2000,100,12,.8,'preview-high')).toHaveLength(6);
    expect(echoSamples(2000,100,12,.8,'export')).toHaveLength(12);
  });

  it('registers Posterize Time and Echo as trusted full-export time effects',()=>{
    const posterize=creativeRegistry.resolve('effect','builtin.effect.posterize-time','1.0.0');
    const echo=creativeRegistry.resolve('effect','builtin.effect.echo','1.0.0');
    expect(posterize).toMatchObject({runtime:'effect.posterize-time',category:'time'});
    expect(echo).toMatchObject({runtime:'effect.echo',category:'time'});
    expect(posterize?.quality.export).toBe('full');
    expect(echo?.quality.export).toBe('full');
    expect(posterize?.params.fps).toMatchObject({kind:'number',default:12,min:1,max:60,keyframeable:true});
    expect(echo?.params.delayMs).toMatchObject({kind:'number',default:120,min:10,max:2000,keyframeable:true});
    expect(echo?.params.trails).toMatchObject({kind:'number',default:4,min:1,max:12,keyframeable:true});
    expect(echo?.params.decay).toMatchObject({kind:'number',default:.6,min:0,max:1,keyframeable:true});
  });
});
