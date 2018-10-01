<?php namespace ffoerster\BZWJena\Updates;

use Schema;
use October\Rain\Database\Updates\Migration;

class BuilderTableCreateFfoersterBzwjenaWeiterbildung extends Migration
{
    public function up()
    {
        Schema::create('ffoerster_bzwjena_weiterbildung', function($table)
        {
            $table->engine = 'InnoDB';
            $table->increments('id');
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->string('wb_title');
            $table->string('wb_slug');
        });
    }
    
    public function down()
    {
        Schema::dropIfExists('ffoerster_bzwjena_weiterbildung');
    }
}
