/* eslint-disable @typescript-eslint/no-empty-function */

import { expect } from 'chai';
import {amqp} from "../src";
import AmqpConnectionManager from "../src/AmqpConnectionManager";

describe('import test', function () {
    it('should let you import as default (#51)', function () {
        expect(amqp).to.exist;
        expect(amqp.connect).to.exist;
    });

    it('should let you import class', function () {
        new AmqpConnectionManager('url');
    });
});
